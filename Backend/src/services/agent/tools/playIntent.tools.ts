/**
 * Play-intent tools (slice 9a, docs/plans/ai-agent.md §16.1, docs/domains/play-intent.md):
 * `get_my_play_intent`, `list_play_intent_matches` (reads) and `set_play_intent`,
 * `cancel_play_intent` (standard writes).
 *
 * Everything goes through the services behind `/play-intents`: reads use
 * `PlayIntentMatchService.getPoolForViewer` (`GET /play-intents/pool`), the create-or-replace
 * body is checked with the route's own `createPlayIntentBodySchema` and executed by
 * `PlayIntentService.createOrReplace` (`POST /play-intents`), and cancel runs
 * `PlayIntentService.cancel` (`DELETE /play-intents/:id`). The lifecycle rules (one OPEN/MATCHED
 * per user + city, leaving a proposal on replace, pending linked invite, expiry, follower
 * notifications, match queue) live there, not here.
 *
 * Agent-only narrowing: the user's **home** city only (the lobby rule; the model can't target
 * another city), club ids must be active clubs of that city, and matching games are re-filtered
 * through `agentVisibleGamesWhere`.
 */
import {
  EntityType,
  GenderTeam,
  MatchProposalStatus,
  PlayIntentStatus,
  PlayIntentTimeOfDay,
  Sport,
} from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentPlayIntentCard } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { resolveIntlLocale } from '../../../utils/intlLocale';
import { parseSport } from '../../../sport/sportIds';
import { createPlayIntentBodySchema } from '../../playIntent/playIntent.schemas';
import { PlayIntentService, type CreatePlayIntentDto } from '../../playIntent/playIntent.service';
import { PlayIntentMatchService } from '../../playIntent/playIntentMatch.service';
import { intentWindowEndsAt } from '../../playIntent/playIntentFreshness';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { agentVisibleGamesWhere } from '../access/agentGameAccess';
import { proposeAgentAction } from '../agentActionPropose';
import { isValidTimeZone } from '../agentContext.service';
import { agentGameEntity, agentGameSummarySelect, toAgentGameSummary } from '../dto/game.dto';
import { agentLang, agentSportLabel } from '../i18n/agentI18n';
import { agentPlayIntentT } from '../i18n/agentPlayIntentI18n';
import { withToolCard } from './agentToolCards';
import { defineTool } from './registry';
import { line, parsePlan } from './writeHelpers';

const ID = z.string().min(1).max(64);
const SPORTS = Object.values(Sport) as [Sport, ...Sport[]];
const TIME_OF_DAYS = Object.values(PlayIntentTimeOfDay) as [PlayIntentTimeOfDay, ...PlayIntentTimeOfDay[]];
const GENDER_TEAMS = Object.values(GenderTeam) as [GenderTeam, ...GenderTeam[]];
const HHMM = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const CLUBS_MAX = 10;

// --- shared -------------------------------------------------------------------------------------

type HomeCity = { id: string; name: string; timezone: string };

/** The lobby is Home-city only (docs/domains/play-intent.md); Browse city never counts. */
async function loadHomeCity(principal: AgentPrincipal): Promise<HomeCity> {
  if (!principal.currentCityId) throw new ApiError(400, 'Set a home city in the app first');
  const city = await prisma.city.findUnique({
    where: { id: principal.currentCityId },
    select: { id: true, name: true, timezone: true },
  });
  if (!city) throw new ApiError(400, 'Set a home city in the app first');
  return { ...city, timezone: isValidTimeZone(city.timezone) ? city.timezone : 'UTC' };
}

async function primarySportOf(userId: string): Promise<Sport> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { primarySport: true } });
  return parseSport(user?.primarySport);
}

type IntentShape = {
  sport: Sport;
  entityType: EntityType;
  dateKeys: string[];
  timeOfDays: PlayIntentTimeOfDay[];
  startTime: string | null;
  endTime: string | null;
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: GenderTeam;
};

function dayLabel(dateKey: string, allowed: string[], locale: string): string {
  if (dateKey === allowed[0]) return agentPlayIntentT(locale, 'value.today');
  if (dateKey === allowed[1]) return agentPlayIntentT(locale, 'value.tomorrow');
  try {
    return new Intl.DateTimeFormat(resolveIntlLocale(agentLang(locale)), {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${dateKey}T12:00:00Z`));
  } catch {
    return dateKey;
  }
}

const PERIOD_KEY = {
  ANYTIME: 'value.anytime',
  MORNING: 'value.morning',
  AFTERNOON: 'value.afternoon',
  EVENING: 'value.evening',
} as const;

const GENDER_KEY = {
  ANY: 'value.genderAny',
  MEN: 'value.genderMen',
  WOMEN: 'value.genderWomen',
  MIX_PAIRS: 'value.genderMix',
} as const;

type IntentLabels = {
  lookingFor: string;
  days: string;
  time: string;
  clubs: string;
  level: string;
  players: string;
};

function describeIntent(intent: IntentShape, clubNames: Map<string, string>, timezone: string, locale: string): IntentLabels {
  const allowed = PlayIntentService.allowedDateKeys(timezone);
  const periods = intent.timeOfDays.length ? intent.timeOfDays : [PlayIntentTimeOfDay.ANYTIME];
  const time = periods
    .map((period) =>
      period === PlayIntentTimeOfDay.CUSTOM
        ? `${intent.startTime ?? '00:00'}–${intent.endTime ?? '24:00'}`
        : agentPlayIntentT(locale, PERIOD_KEY[period]),
    )
    .join(', ');
  const isBar = intent.entityType === EntityType.BAR;
  return {
    lookingFor: isBar
      ? agentPlayIntentT(locale, 'value.bar')
      : agentPlayIntentT(locale, 'value.game', { sport: agentSportLabel(locale, intent.sport) }),
    days: [...intent.dateKeys].sort().map((key) => dayLabel(key, allowed, locale)).join(', '),
    time,
    clubs: intent.clubIds.length
      ? intent.clubIds.map((id) => clubNames.get(id) ?? id).join(', ')
      : agentPlayIntentT(locale, 'value.anyClub'),
    level:
      intent.minLevel == null && intent.maxLevel == null
        ? agentPlayIntentT(locale, 'value.anyLevel')
        : `${intent.minLevel ?? '…'}–${intent.maxLevel ?? '…'}`,
    players: agentPlayIntentT(locale, GENDER_KEY[intent.genderTeams]),
  };
}

/** Card of the user's open request (slice 9e): when / where / level chips, match count. */
function playIntentCard(params: {
  intent: IntentShape & { status: PlayIntentStatus };
  labels: IntentLabels;
  cityName: string;
  matchingGameCount: number;
  proposal: { members: unknown[]; status: string } | null;
}): AgentPlayIntentCard | null {
  const { intent, labels } = params;
  if (intent.status !== PlayIntentStatus.OPEN && intent.status !== PlayIntentStatus.MATCHED) return null;
  const isBar = intent.entityType === EntityType.BAR;
  return {
    kind: 'play_intent',
    status: intent.status,
    cityName: params.cityName,
    lookingFor: labels.lookingFor,
    chips: [
      { kind: 'days', label: labels.days },
      { kind: 'time', label: labels.time },
      { kind: 'clubs', label: labels.clubs },
      ...(isBar
        ? []
        : [
            { kind: 'level' as const, label: labels.level },
            { kind: 'players' as const, label: labels.players },
          ]),
    ],
    matchingGameCount: params.matchingGameCount,
    proposal: params.proposal ? { memberCount: params.proposal.members.length, status: params.proposal.status } : null,
  };
}

async function clubNamesFor(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await prisma.club.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

function intentShape(intent: {
  sport: Sport;
  entityType: EntityType;
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays: PlayIntentTimeOfDay[];
  startTime: string | null;
  endTime: string | null;
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: GenderTeam;
}): IntentShape {
  return { ...intent, timeOfDays: intent.timeOfDays.length ? intent.timeOfDays : [intent.timeOfDay] };
}

/** `GET /play-intents/pool` for the home city, the same service the lobby uses. */
async function homePool(principal: AgentPrincipal) {
  const city = await loadHomeCity(principal);
  const pool = await PlayIntentMatchService.getPoolForViewer(principal.userId, city.id, await primarySportOf(principal.userId));
  return { city, pool };
}

/** Radar games (already public + fitting) narrowed to what the agent may show, in radar order. */
async function visibleMatchingGames(principal: AgentPrincipal, matching: Array<{ id: string; allowDirectJoin: boolean }>) {
  if (!matching.length) return [];
  const rows = await prisma.game.findMany({
    where: { AND: [{ id: { in: matching.map((game) => game.id) } }, agentVisibleGamesWhere(principal)] },
    select: agentGameSummarySelect(principal.userId),
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return matching.flatMap((game) => {
    const row = byId.get(game.id);
    return row ? [{ row, allowDirectJoin: game.allowDirectJoin }] : [];
  });
}

// --- get_my_play_intent -------------------------------------------------------------------------

export const getMyPlayIntentTool = defineTool({
  name: 'get_my_play_intent',
  description:
    "The user's open play request (\"looking to play\") in their home city: sport or bar meetup, days, time window, clubs, level, its status (OPEN / MATCHED), the match proposal they are in (if any) and how many visible games fit it. null when they are not looking.",
  kind: 'read',
  scope: 'user',
  input: z.object({}).strict(),
  label: (_args, locale) => agentPlayIntentT(locale, 'label.getMyPlayIntent'),
  handler: async (ctx) => {
    const { principal, locale } = ctx;
    const { city, pool } = await homePool(principal);
    const intent = pool.myIntent;
    if (!intent) {
      return {
        data: { intent: null, proposal: null, matchingGameCount: 0, homeCity: city.name },
        summary: agentPlayIntentT(locale, 'summary.noIntent'),
      };
    }
    const shape = intentShape(intent);
    const labels = describeIntent(shape, await clubNamesFor(shape.clubIds), city.timezone, locale);
    const games = await visibleMatchingGames(principal, pool.matchingGames);
    const proposal = pool.pendingProposal;
    const mine = proposal?.members.find((member) => member.userId === principal.userId);
    const card = playIntentCard({
      intent: { ...shape, status: intent.status },
      labels,
      cityName: city.name,
      matchingGameCount: games.length,
      proposal: proposal ?? null,
    });
    return withToolCard({
      data: {
        intent: {
          intentId: intent.id,
          status: intent.status,
          cityName: city.name,
          cityTimezone: city.timezone,
          sport: shape.sport,
          entityType: shape.entityType,
          dateKeys: shape.dateKeys,
          timeOfDays: shape.timeOfDays,
          startTime: shape.startTime,
          endTime: shape.endTime,
          clubIds: shape.clubIds,
          minLevel: shape.minLevel,
          maxLevel: shape.maxLevel,
          genderTeams: shape.genderTeams,
          expiresAt: intent.expiresAt.toISOString(),
          labels,
        },
        proposal: proposal
          ? {
              proposalId: proposal.id,
              status: proposal.status,
              memberCount: proposal.members.length,
              iAmHost: proposal.hostUserId === principal.userId,
              myResponse: mine?.response ?? null,
              suggestedStartTime: proposal.suggestedStartTime?.toISOString() ?? null,
              expiresAt: proposal.expiresAt.toISOString(),
            }
          : null,
        matchingGameCount: games.length,
        ...(proposal ? { note: 'While a match proposal is open the app shows the proposal, not matching games.' } : {}),
      },
      summary: agentPlayIntentT(locale, 'summary.intent', { days: labels.days, time: labels.time }),
    }, card);
  },
});

// --- list_play_intent_matches -------------------------------------------------------------------

export const listPlayIntentMatchesTool = defineTool({
  name: 'list_play_intent_matches',
  description:
    "Games that fit the user's open play request (the Find radar: public games with a free playing seat, soonest and direct-join first, at most 4), only games the user may see. Empty when they have no open request or are in a match proposal. To join one use join_game.",
  kind: 'read',
  scope: 'user',
  input: z.object({}).strict(),
  label: (_args, locale) => agentPlayIntentT(locale, 'label.listMatches'),
  handler: async (ctx) => {
    const { principal, locale } = ctx;
    const { city, pool } = await homePool(principal);
    if (!pool.myIntent) {
      return {
        data: { hasOpenIntent: false, games: [], note: 'No open play request; set_play_intent creates one.' },
        summary: agentPlayIntentT(locale, 'summary.noIntent'),
      };
    }
    const games = await visibleMatchingGames(principal, pool.matchingGames);
    const shape = intentShape(pool.myIntent);
    const card = playIntentCard({
      intent: { ...shape, status: pool.myIntent.status },
      labels: describeIntent(shape, await clubNamesFor(shape.clubIds), city.timezone, locale),
      cityName: city.name,
      matchingGameCount: games.length,
      proposal: pool.pendingProposal ?? null,
    });
    return withToolCard({
      data: {
        hasOpenIntent: true,
        intentId: pool.myIntent.id,
        inProposal: Boolean(pool.pendingProposal),
        games: games.map(({ row, allowDirectJoin }) => ({ ...toAgentGameSummary(row), allowDirectJoin })),
      },
      summary: agentPlayIntentT(locale, 'summary.matches', { count: games.length }),
      entities: games.map(({ row }) => agentGameEntity(row)),
    }, card);
  },
});

// --- set_play_intent ----------------------------------------------------------------------------

const setPlayIntentInput = z
  .object({
    cityId: ID.optional().describe("Only the user's home city (the default); any other city is refused"),
    sport: z.enum(SPORTS).optional().describe("Default: the user's primary sport"),
    entityType: z.enum([EntityType.GAME, EntityType.BAR]).optional().describe('GAME (default) = play; BAR = a bar meetup'),
    dayOffsets: z
      .array(z.number().int().min(0).max(2))
      .min(1)
      .max(3)
      .optional()
      .describe('0 = today, 1 = tomorrow, 2 = the day after (home city). Default [0]. Not with dateKeys'),
    dateKeys: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .min(1)
      .max(3)
      .optional()
      .describe('YYYY-MM-DD in the home city, today to the day after only'),
    timeOfDays: z
      .array(z.enum(TIME_OF_DAYS))
      .min(1)
      .max(4)
      .optional()
      .describe('MORNING 06-12, AFTERNOON 12-18, EVENING 18-24, ANYTIME (default), or CUSTOM with startTime/endTime. ANYTIME and CUSTOM go alone'),
    startTime: z.string().regex(HHMM).optional().describe('HH:MM, CUSTOM only (e.g. "after 19:00" → 19:00)'),
    endTime: z.string().regex(HHMM).optional().describe('HH:MM, CUSTOM only; 24:00 = end of day'),
    clubIds: z.array(ID).min(1).max(CLUBS_MAX).optional().describe('Club ids from search_clubs (home city); default any club'),
    minLevel: z.number().min(0).max(10).optional(),
    maxLevel: z.number().min(0).max(10).optional(),
    genderTeams: z.enum(GENDER_TEAMS).optional().describe('ANY (default), MEN, WOMEN, MIX_PAIRS'),
  })
  .strict();

const setPlanSchema = z
  .object({
    cityId: z.string(),
    /** The `POST /play-intents` body the app would send (sport and date keys resolved at propose). */
    body: z.record(z.string(), z.unknown()),
  })
  .strict();

function assertHomeCity(principal: AgentPrincipal, cityId: string): void {
  if (principal.currentCityId !== cityId) {
    throw new ApiError(400, "Play requests are only for the user's home city; change the home city in the app first");
  }
}

export const setPlayIntentTool = defineTool({
  name: 'set_play_intent',
  description:
    'Prepare a play request ("I want to play tonight after 19:00") in the user\'s home city: sport or bar meetup, today to the day after, time window, optional clubs, level and gender. It replaces the current request in that city. Creates a confirmation card; nothing changes until the user confirms.',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint:
    'set or replace the user\'s play request ("looking to play") in their home city (today to the day after; "after 19:00" = CUSTOM 19:00–24:00)',
  input: setPlayIntentInput,
  label: (_args, locale) => agentPlayIntentT(locale, 'label.setPlayIntent'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    const city = await loadHomeCity(principal);
    if (args.cityId !== undefined) assertHomeCity(principal, args.cityId);
    const sport = parseSport(args.sport ?? (await primarySportOf(principal.userId)));
    const entityType = args.entityType ?? EntityType.GAME;

    // The route's own schema (strict, CUSTOM needs both times, ANYTIME/CUSTOM alone, …).
    const draft: CreatePlayIntentDto = {
      cityId: city.id,
      sport,
      entityType,
      ...(args.dayOffsets ? { dayOffsets: args.dayOffsets } : {}),
      ...(args.dateKeys ? { dateKeys: args.dateKeys } : {}),
      ...(args.timeOfDays ? { timeOfDays: args.timeOfDays } : {}),
      ...(args.startTime !== undefined ? { startTime: args.startTime } : {}),
      ...(args.endTime !== undefined ? { endTime: args.endTime } : {}),
      ...(args.clubIds ? { clubIds: [...new Set(args.clubIds)] } : {}),
      ...(args.minLevel !== undefined ? { minLevel: args.minLevel } : {}),
      ...(args.maxLevel !== undefined ? { maxLevel: args.maxLevel } : {}),
      ...(args.genderTeams ? { genderTeams: args.genderTeams } : {}),
    };
    const checked = createPlayIntentBodySchema.safeParse(draft);
    if (!checked.success) {
      throw new ApiError(400, checked.error.issues[0]?.message ?? 'Invalid play request');
    }

    const clubIds = draft.clubIds ?? [];
    if (clubIds.length) {
      const clubs = await prisma.club.count({ where: { id: { in: clubIds }, cityId: city.id, isActive: true } });
      if (clubs !== clubIds.length) throw new ApiError(404, 'Club not found');
    }

    // Resolve the days now so the card shows exactly what gets created (a confirm after
    // midnight must not silently shift "today").
    const dateKeys = PlayIntentService.resolveDateKeys({
      timezone: city.timezone,
      dayOffsets: draft.dayOffsets,
      dateKeys: draft.dateKeys,
    });
    if (!dateKeys.length) {
      throw new ApiError(400, 'Pick today, tomorrow or the day after (home city dates)');
    }
    const timeOfDays = draft.timeOfDays ?? [PlayIntentTimeOfDay.ANYTIME];
    const custom = timeOfDays.includes(PlayIntentTimeOfDay.CUSTOM);
    const endsAt = intentWindowEndsAt(
      {
        dateKeys,
        timeOfDay: timeOfDays[0],
        timeOfDays,
        startTime: custom ? draft.startTime ?? null : null,
        endTime: custom ? draft.endTime ?? null : null,
      },
      city.timezone,
    );
    if (endsAt && endsAt <= ctx.now) throw new ApiError(400, 'That time window has already ended');

    const body: CreatePlayIntentDto = { ...draft, dateKeys };
    delete body.dayOffsets;

    const isBar = entityType === EntityType.BAR;
    const next: IntentShape = {
      sport,
      entityType,
      dateKeys,
      timeOfDays,
      startTime: custom ? draft.startTime ?? null : null,
      endTime: custom ? draft.endTime ?? null : null,
      clubIds,
      minLevel: isBar ? null : draft.minLevel ?? null,
      maxLevel: isBar ? null : draft.maxLevel ?? null,
      genderTeams: isBar ? GenderTeam.ANY : draft.genderTeams ?? GenderTeam.ANY,
    };
    const existing = await PlayIntentService.getMyActiveIntent(principal.userId, city.id);
    const current = existing ? intentShape(existing) : null;
    const names = await clubNamesFor([...clubIds, ...(current?.clubIds ?? [])]);
    const to = describeIntent(next, names, city.timezone, locale);
    const from = current ? describeIntent(current, names, city.timezone, locale) : null;

    const lines: AgentActionPreviewLine[] = [line(agentPlayIntentT(locale, 'field.city'), null, city.name)];
    const fields: Array<[keyof IntentLabels, Parameters<typeof agentPlayIntentT>[1]]> = [
      ['lookingFor', 'field.lookingFor'],
      ['days', 'field.days'],
      ['time', 'field.time'],
      ['clubs', 'field.clubs'],
      ...(isBar
        ? []
        : ([
            ['level', 'field.level'],
            ['players', 'field.players'],
          ] as Array<[keyof IntentLabels, Parameters<typeof agentPlayIntentT>[1]]>)),
    ];
    for (const [key, label] of fields) {
      lines.push(line(agentPlayIntentT(locale, label), from ? from[key] : null, to[key]));
    }

    const warnings: string[] = [];
    if (existing) warnings.push(agentPlayIntentT(locale, 'warn.replaces'));
    const inProposal = await prisma.matchProposalMember.findFirst({
      where: {
        userId: principal.userId,
        proposal: {
          cityId: city.id,
          status: { in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED] },
          gameId: null,
        },
      },
      select: { proposalId: true },
    });
    if (inProposal) warnings.push(agentPlayIntentT(locale, 'warn.leavesProposal'));
    if (!isBar && !existing) warnings.push(agentPlayIntentT(locale, 'warn.followersNotified'));

    const preview: AgentActionPreview = {
      title: isBar
        ? agentPlayIntentT(locale, 'preview.setTitleBar')
        : agentPlayIntentT(locale, 'preview.setTitle', { sport: agentSportLabel(locale, sport) }),
      lines,
      warnings,
    };
    const plan: z.infer<typeof setPlanSchema> = { cityId: city.id, body };
    return proposeAgentAction(ctx, { toolName: 'set_play_intent', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(setPlanSchema, rawPlan);
      assertHomeCity(principal, plan.cityId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(setPlanSchema, rawPlan);
      const checked = createPlayIntentBodySchema.safeParse(plan.body);
      if (!checked.success) throw new ApiError(400, checked.error.issues[0]?.message ?? 'Invalid play request');
      const userId = ctx.principal.userId;
      const before = await PlayIntentService.getMyActiveIntent(userId, plan.cityId);
      const intent = await PlayIntentService.createOrReplace(userId, checked.data);
      const unchanged = before?.id === intent.id;
      return {
        message: agentPlayIntentT(ctx.locale, unchanged ? 'result.unchanged' : 'result.set'),
        modelData: {
          intentId: intent.id,
          status: intent.status,
          unchanged,
          replacedIntentId: before && !unchanged ? before.id : null,
          sport: intent.sport,
          entityType: intent.entityType,
          dateKeys: intent.dateKeys,
          timeOfDays: intent.timeOfDays,
          startTime: intent.startTime,
          endTime: intent.endTime,
          expiresAt: intent.expiresAt.toISOString(),
        },
      };
    },
  },
});

// --- cancel_play_intent -------------------------------------------------------------------------

const cancelPlanSchema = z.object({ intentId: z.string() }).strict();

async function loadCancellableIntent(principal: AgentPrincipal, intentId: string) {
  const intent = await prisma.playIntent.findFirst({
    where: {
      id: intentId,
      userId: principal.userId,
      status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
    },
    select: { id: true },
  });
  if (!intent) throw new ApiError(404, 'No open play intent found');
}

export const cancelPlayIntentTool = defineTool({
  name: 'cancel_play_intent',
  description:
    "Prepare cancelling the user's open play request in their home city (they stop looking to play; a match proposal they are in is left). Creates a confirmation card; nothing changes until the user confirms.",
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: "cancel the user's play request (stop looking to play)",
  input: z.object({}).strict(),
  label: (_args, locale) => agentPlayIntentT(locale, 'label.cancelPlayIntent'),
  handler: async (ctx) => {
    const { principal, locale } = ctx;
    const city = await loadHomeCity(principal);
    const intent = await PlayIntentService.getMyActiveIntent(principal.userId, city.id);
    if (!intent) throw new ApiError(400, 'The user has no open play request to cancel');
    const shape = intentShape(intent);
    const labels = describeIntent(shape, await clubNamesFor(shape.clubIds), city.timezone, locale);
    const warnings: string[] = [];
    const inProposal = await prisma.matchProposalMember.findFirst({
      where: {
        userId: principal.userId,
        intentId: intent.id,
        proposal: { status: { in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED] }, gameId: null },
      },
      select: { proposalId: true },
    });
    if (inProposal) warnings.push(agentPlayIntentT(locale, 'warn.leavesProposal'));
    const preview: AgentActionPreview = {
      title: agentPlayIntentT(locale, 'preview.cancelTitle'),
      lines: [
        line(agentPlayIntentT(locale, 'field.city'), null, city.name),
        line(agentPlayIntentT(locale, 'field.lookingFor'), null, labels.lookingFor),
        line(agentPlayIntentT(locale, 'field.days'), null, labels.days),
        line(agentPlayIntentT(locale, 'field.time'), null, labels.time),
        line(agentPlayIntentT(locale, 'field.request'), intent.status, agentPlayIntentT(locale, 'value.cancelled')),
      ],
      warnings,
    };
    const plan: z.infer<typeof cancelPlanSchema> = { intentId: intent.id };
    return proposeAgentAction(ctx, { toolName: 'cancel_play_intent', input: {}, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(cancelPlanSchema, rawPlan);
      await loadCancellableIntent(principal, plan.intentId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(cancelPlanSchema, rawPlan);
      // `DELETE /play-intents/:id`.
      const result = await PlayIntentService.cancel(ctx.principal.userId, plan.intentId);
      return {
        message: agentPlayIntentT(ctx.locale, 'result.cancelled'),
        modelData: { intentId: plan.intentId, cancelled: result.cancelled },
      };
    },
  },
});

export const PLAY_INTENT_TOOLS = [getMyPlayIntentTool, listPlayIntentMatchesTool, setPlayIntentTool, cancelPlayIntentTool];
