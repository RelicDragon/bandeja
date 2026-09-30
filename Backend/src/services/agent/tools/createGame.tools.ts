/**
 * `create_game` (phase 3 write): a casual GAME / TOURNAMENT from a create template, or a
 * TRAINING, at a club. Casual create templates only (`@bandeja/shared` createTemplates;
 * constraint "Create templates ≠ league/playoff formats"): no leagues, playoffs or events.
 *
 * The confirm step calls `GameCreateService.createGame(body, userId, isAdmin)` — what
 * `POST /games` does — with the body the app's create page sends (`CreateGame.tsx`
 * executeCreateGame) at its defaults. The template → format fields mirror the app's
 * `applyCreateTemplate` + `buildSetupFromFormat` (see `createGameFormat.ts`).
 */
import { EntityType, ParticipantStatus, Sport } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { CREATE_TEMPLATES, type CreateTemplate, type CreateTemplateId } from '../../../shared/createTemplates';
import { getImplementedSports, getSportConfig } from '../../../sport/sportRegistry';
import { ApiError } from '../../../utils/ApiError';
import { assertMaxParticipantsWithinUserCap } from '../../../utils/game/userMaxParticipantsCap';
import { GameCreateService } from '../../game/create.service';
import { findOverlappingPlayingGames } from '../../game/gameSlotOverlap.service';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { proposeAgentAction } from '../agentActionPropose';
import { isValidTimeZone } from '../agentContext.service';
import { agentGameEntity, agentGameSummarySelect } from '../dto/game.dto';
import {
  agentEntityTypeLabel,
  agentGameTypeLabel,
  agentSportLabel,
  agentT,
  formatAgentDateTime,
} from '../i18n/agentI18n';
import { buildTemplateFormatPayload, defaultLevelBand, describeTemplateFormat } from './createGameFormat';
import { defineTool, parseAgentDate, type AgentToolContext } from './registry';

const ID = z.string().min(1).max(64);
const SPORTS = Object.values(Sport) as [Sport, ...Sport[]];
const TEMPLATE_IDS = Object.keys(CREATE_TEMPLATES) as [CreateTemplateId, ...CreateTemplateId[]];
const CREATABLE_ENTITY_TYPES = [EntityType.GAME, EntityType.TOURNAMENT, EntityType.TRAINING] as const;
/** The create page's default duration (`useGameTimeDuration`: 2 h). */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const TOURNAMENT_DEFAULT_MAX = 8;

const TEMPLATE_CATALOGUE = TEMPLATE_IDS.map((id) => {
  const t = CREATE_TEMPLATES[id];
  return `${id} (${t.sport}, ${t.gameType}, ${t.scoringPreset}, ${t.playersPerMatch === 2 ? 'singles' : 'doubles'}, ${t.tier})`;
}).join('; ');
const TEMPLATE_HINT =
  'Pick the template whose type matches what you tell the user (e.g. Americano → a *_AMERICANO_* template, Mexicano → *_MEXICANO_*, King of the Court → *_KOTC_*); rotation formats (Americano, Mexicano, King of the Court, Ladder) need 6+ players, at 5 or fewer the matches are generated automatically.';

/**
 * Every `create_game` field except the place and time (club / court / start / end). Shared with
 * `create_game_with_booking` (slice 7d2), where a `slotRef` supplies the place and time.
 */
export const createGameFieldsShape = {
  entityType: z.enum(CREATABLE_ENTITY_TYPES).default(EntityType.GAME).describe('GAME (2 or 4 players), TOURNAMENT (bigger rosters) or TRAINING (trainers only)'),
  sport: z.enum(SPORTS),
  templateId: z.enum(TEMPLATE_IDS).optional().describe(`Format template, required for GAME/TOURNAMENT, must match the sport. ${TEMPLATE_HINT} Templates: ${TEMPLATE_CATALOGUE}`),
  maxParticipants: z.number().int().min(1).max(64).optional().describe('Default: 4 (2 for singles templates) for GAME, 8 for TOURNAMENT'),
  isPublic: z.boolean().default(true),
  allowDirectJoin: z.boolean().default(false).describe('true = players join without organizer approval'),
  name: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  minLevel: z.number().min(1).max(7).optional(),
  maxLevel: z.number().min(1).max(7).optional(),
  creatorPlays: z.boolean().default(true).describe('Whether the user plays (false = organizes only)'),
};
export type CreateGameFields = z.infer<z.ZodObject<typeof createGameFieldsShape>>;

const createGameInput = z
  .object({
    ...createGameFieldsShape,
    clubId: ID.describe('Club id from search_clubs'),
    courtId: ID.optional().describe('Court id from get_club'),
    startTime: z.string().max(40).describe('YYYY-MM-DDTHH:mm in the club city timezone, or ISO date-time'),
    endTime: z.string().max(40).optional().describe('Default: start + 2 hours'),
  })
  .strict();

export const createPlanSchema = z
  .object({
    /** Exactly the `POST /games` body the create page would send. */
    body: z.record(z.string(), z.unknown()),
    entityType: z.enum(CREATABLE_ENTITY_TYPES),
  })
  .strict();

export type CreateGamePlan = z.infer<typeof createPlanSchema>;

/** Mirrors the create menu (`CreateMenuModal`): TRAINING needs isTrainer or admin. */
export function assertMayCreate(principal: AgentPrincipal, entityType: (typeof CREATABLE_ENTITY_TYPES)[number]): void {
  if (entityType === EntityType.TRAINING && !principal.isTrainer && !principal.isAdmin) {
    throw new ApiError(403, 'Only trainers can create trainings');
  }
}

/** Propose-time field guards (who may create what, sport, template); before any DB read. */
export function checkCreateGameFields(principal: AgentPrincipal, args: CreateGameFields): CreateTemplate | null {
  assertMayCreate(principal, args.entityType);
  if (!getImplementedSports().includes(args.sport)) throw new ApiError(400, 'This sport cannot be created yet');
  const isTraining = args.entityType === EntityType.TRAINING;
  const template = args.templateId ? CREATE_TEMPLATES[args.templateId] : null;
  if (!isTraining && !template) throw new ApiError(400, 'templateId is required for GAME and TOURNAMENT');
  if (template && template.sport !== args.sport) throw new ApiError(400, 'templateId does not match the sport');
  return template;
}

/** Where and when the game is; `create_game` resolves it from its input, `create_game_with_booking` from the slot. */
export type CreateGamePlace = {
  club: { id: string; name: string; cityId: string };
  court: { id: string; name: string } | null;
  start: Date;
  end: Date;
  timezone: string;
};

/** The `POST /games` body at the create page's defaults plus the card's lines, split so callers can put the place in between. */
export type CreateGameDraft = {
  plan: CreateGamePlan;
  /** Type, sport, format. */
  headLines: AgentActionPreviewLine[];
  /** Club, court, start, end. */
  placeLines: AgentActionPreviewLine[];
  /** Max players, level, visibility, direct join, your place, name, description. */
  settingLines: AgentActionPreviewLine[];
  warnings: string[];
};

export async function buildCreateGameDraft(
  ctx: Pick<AgentToolContext, 'principal' | 'locale' | 'now'>,
  args: CreateGameFields,
  template: CreateTemplate | null,
  place: CreateGamePlace,
): Promise<CreateGameDraft> {
  const { principal, locale } = ctx;
  const { club, court, start, end, timezone } = place;
  const isTraining = args.entityType === EntityType.TRAINING;
  const sportConfig = getSportConfig(args.sport);
  const maxParticipants =
    args.maxParticipants ??
    (isTraining
      ? sportConfig.defaultEventRoster
      : args.entityType === EntityType.TOURNAMENT
        ? TOURNAMENT_DEFAULT_MAX
        : template!.playersPerMatch === 2
          ? 2
          : 4);

  // `createGame`'s own roster cap check, run at propose so a bad size never reaches confirm
  // (for `create_game_with_booking` that would leave a booked court without a game).
  const actor = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { canCreateTournament: true, maxParticipantsInGame: true },
  });
  assertMaxParticipantsWithinUserCap({ jwtIsAdmin: principal.isAdmin, actor, maxParticipants, entityType: args.entityType });

  const profile = await prisma.userSportProfile.findFirst({
    where: { userId: principal.userId, sport: args.sport },
    select: { level: true },
  });
  const [defaultMin, defaultMax] = defaultLevelBand(template?.tier ?? 'match', profile?.level ?? null);
  const minLevel = args.minLevel ?? defaultMin;
  const maxLevel = args.maxLevel ?? defaultMax;
  if (minLevel > maxLevel) throw new ApiError(400, 'minLevel must not be above maxLevel');

  const creatorPlays = args.creatorPlays;
  // `CreateGame.tsx` executeCreateGame, at the page defaults.
  const body: Record<string, unknown> = {
    sport: args.sport,
    entityType: args.entityType,
    cityId: club.cityId,
    clubId: club.id,
    ...(court ? { courtId: court.id } : {}),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    timeOverride: false,
    hasBookedCourt: false,
    timeIsSet: true,
    maxParticipants,
    minParticipants: 2,
    minLevel,
    maxLevel,
    isPublic: args.isPublic,
    anyoneCanInvite: false,
    allowDirectJoin: args.allowDirectJoin,
    afterGameGoToBar: false,
    suitableForNovices: false,
    ...(args.name ? { name: args.name } : {}),
    description: args.description ?? '',
    participants: creatorPlays ? [principal.userId] : [],
    ...(isTraining && !creatorPlays ? { creatorNonPlaying: true } : {}),
    priceType: 'NOT_KNOWN',
  };
  if (!isTraining && template) {
    Object.assign(body, {
      playersPerMatch: template.playersPerMatch,
      affectsRating: template.affectsRating,
      resultsByAnyone: false,
      hasFixedTeams: false,
      allowUserInMultipleTeams: false,
      resultsRoundGenV2: true,
      genderTeams: 'ANY',
      ...buildTemplateFormatPayload(template, maxParticipants),
    });
  }

  const headLines: AgentActionPreviewLine[] = [
    { label: agentT(locale, 'field.type'), from: null, to: agentEntityTypeLabel(locale, args.entityType) },
    { label: agentT(locale, 'field.sport'), from: null, to: agentSportLabel(locale, args.sport) },
    ...(template
      ? [
          {
            label: agentT(locale, 'field.format'),
            from: null,
            to: [
              // The template's own type (what the model picked and the app's picker shows),
              // never the derived enum: an Americano template at ≤ 5 players stores
              // gameType CUSTOM with automatic matches.
              agentGameTypeLabel(locale, template.gameType),
              body.matchGenerationType !== template.matchGenerationType ? agentT(locale, 'format.autoMatches') : '',
              describeTemplateFormat(locale, template),
              agentT(locale, template.affectsRating ? 'format.rated' : 'format.unrated'),
            ]
              .filter(Boolean)
              .join(' · '),
          },
        ]
      : []),
  ];
  const placeLines: AgentActionPreviewLine[] = [
    { label: agentT(locale, 'field.club'), from: null, to: club.name },
    ...(court ? [{ label: agentT(locale, 'field.court'), from: null, to: court.name }] : []),
    { label: agentT(locale, 'field.start'), from: null, to: formatAgentDateTime(start, timezone, locale) },
    { label: agentT(locale, 'field.end'), from: null, to: formatAgentDateTime(end, timezone, locale) },
  ];
  const settingLines: AgentActionPreviewLine[] = [
    { label: agentT(locale, 'field.maxParticipants'), from: null, to: String(maxParticipants) },
    { label: agentT(locale, 'field.level'), from: null, to: `${minLevel.toFixed(1)}–${maxLevel.toFixed(1)}` },
    { label: agentT(locale, 'field.visibility'), from: null, to: agentT(locale, args.isPublic ? 'value.public' : 'value.private') },
    { label: agentT(locale, 'field.directJoin'), from: null, to: agentT(locale, args.allowDirectJoin ? 'value.yes' : 'value.no') },
    {
      label: agentT(locale, 'field.yourPlace'),
      from: null,
      to: agentT(locale, creatorPlays ? 'value.player' : 'value.organizer'),
    },
    ...(args.name ? [{ label: agentT(locale, 'field.name'), from: null, to: args.name.slice(0, 60) }] : []),
    ...(args.description
      ? [{ label: agentT(locale, 'field.description'), from: null, to: args.description.replace(/\s+/g, ' ').slice(0, 80) }]
      : []),
  ];
  const warnings: string[] = [];
  if (start.getTime() < ctx.now.getTime()) warnings.push(agentT(locale, 'warn.past'));
  if (creatorPlays) {
    const [overlap] = await findOverlappingPlayingGames(principal.userId, { id: '', startTime: start, endTime: end, timeIsSet: true });
    if (overlap) {
      warnings.push(
        agentT(locale, 'warn.overlap', {
          game: (overlap.name ?? '').slice(0, 40) || agentEntityTypeLabel(locale, EntityType.GAME),
          time: formatAgentDateTime(new Date(overlap.startTime), timezone, locale),
        }),
      );
      // The card showed the overlap; confirming is the app's "create anyway".
      body.confirmOverlap = true;
    }
  }
  if (args.isPublic) warnings.push(agentT(locale, 'warn.visibleToAll'));

  return { plan: { body, entityType: args.entityType }, headLines, placeLines, settingLines, warnings };
}

/**
 * The confirm half of `create_game`: `GameCreateService.createGame` (what `POST /games` runs) with
 * the stored body, plus `extra` fields (`create_game_with_booking`: courts, times and bookings).
 */
export async function createGameFromPlan(
  principal: AgentPrincipal,
  plan: CreateGamePlan,
  extra: Record<string, unknown> = {},
): Promise<{ gameId: string; entities: AgentEntityRef[]; modelData: Record<string, unknown> }> {
  // `createGame` mutates its input; pass a copy of the stored body.
  const created = (await GameCreateService.createGame(
    { ...plan.body, ...extra, participants: [...((plan.body.participants as string[] | undefined) ?? [])] },
    principal.userId,
    principal.isAdmin,
  )) as { id: string };
  const row = await prisma.game.findUnique({ where: { id: created.id }, select: agentGameSummarySelect(principal.userId) });
  const mine = await prisma.gameParticipant.findFirst({
    where: { gameId: created.id, userId: principal.userId },
    select: { status: true },
  });
  return {
    gameId: created.id,
    entities: row ? [agentGameEntity(row)] : [],
    modelData: {
      gameId: created.id,
      startTime: row?.startTime.toISOString() ?? null,
      myStatus: mine?.status ?? ParticipantStatus.NON_PLAYING,
    },
  };
}

export const createGameTool = defineTool({
  name: 'create_game',
  description:
    'Prepare a new casual game (GAME / TOURNAMENT with a format template) or a TRAINING at a club for the user, without booking a court. Creates a confirmation card that lists every field; nothing is created until the user confirms. No leagues, playoffs or events. To play at a slot from find_available_slots, use create_game_with_booking instead (it books the court too).',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'create a casual game, tournament or training at a club without booking a court (format templates only, never leagues, playoffs or events)',
  input: createGameInput,
  label: (_args, locale) => agentT(locale, 'label.createGame'),
  handler: async (ctx, args) => {
    const { locale } = ctx;
    const template = checkCreateGameFields(ctx.principal, args);

    const club = await prisma.club.findUnique({
      where: { id: args.clubId },
      select: { id: true, name: true, isActive: true, isForPlaying: true, cityId: true, city: { select: { timezone: true } } },
    });
    if (!club || !club.isActive) throw new ApiError(404, 'Club not found');
    if (!club.isForPlaying) throw new ApiError(400, 'This club is not available for playing games');
    let court: { id: string; name: string } | null = null;
    if (args.courtId) {
      const row = await prisma.court.findUnique({ where: { id: args.courtId }, select: { id: true, name: true, clubId: true, isActive: true } });
      if (!row || !row.isActive) throw new ApiError(404, 'Court not found');
      if (row.clubId !== club.id) throw new ApiError(400, 'Court does not belong to the selected club');
      court = { id: row.id, name: row.name };
    }

    const timezone = isValidTimeZone(club.city.timezone) ? club.city.timezone : ctx.timezone;
    const start = parseAgentDate(args.startTime, timezone);
    if (!start) throw new ApiError(400, 'startTime is not a valid date-time');
    const end = args.endTime ? parseAgentDate(args.endTime, timezone) : new Date(start.getTime() + DEFAULT_DURATION_MS);
    if (!end) throw new ApiError(400, 'endTime is not a valid date-time');
    if (!(start < end)) throw new ApiError(400, 'endTime must be after startTime');
    if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) throw new ApiError(400, 'A game cannot last more than 24 hours');

    const draft = await buildCreateGameDraft(ctx, args, template, {
      club: { id: club.id, name: club.name, cityId: club.cityId },
      court,
      start,
      end,
      timezone,
    });
    const preview: AgentActionPreview = {
      title: agentT(locale, 'preview.create.title', { type: agentEntityTypeLabel(locale, args.entityType) }),
      lines: [...draft.headLines, ...draft.placeLines, ...draft.settingLines],
      warnings: draft.warnings,
    };
    return proposeAgentAction(ctx, { toolName: 'create_game', input: args, plan: draft.plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const parsed = createPlanSchema.safeParse(rawPlan);
      if (!parsed.success) throw new Error('stored agent action plan is invalid');
      assertMayCreate(principal, parsed.data.entityType);
    },
    execute: async (ctx, rawPlan) => {
      const parsed = createPlanSchema.safeParse(rawPlan);
      if (!parsed.success) throw new Error('stored agent action plan is invalid');
      const created = await createGameFromPlan(ctx.principal, parsed.data);
      return { message: agentT(ctx.locale, 'result.created'), entities: created.entities, modelData: created.modelData };
    },
  },
});

export const CREATE_GAME_TOOLS = [createGameTool];
