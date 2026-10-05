/**
 * `get_league_schedule` (phase 4a read): rounds and fixtures of a league season.
 * Guard: `assertAgentCanViewLeagueSeason` — leagues are for everyone, so any principal
 * reads any season's schedule (like `GET /leagues/:id/rounds`). Fixtures are still ANDed
 * with `agentVisibleGamesWhere`, which treats children of a season as league content
 * (visible to all), so the listing and `get_game` on a fixture always agree.
 */
import { EntityType, GameStatus, ParticipantRole, ResultsStatus, type Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import { z } from 'zod/v4';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { hasParentGamePermission } from '../../../utils/parentGamePermissions';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { agentGameNotFound, agentVisibleGamesWhere, assertAgentCanViewLeagueSeason } from '../access/agentGameAccess';
import { agentGameTitle } from '../dto/game.dto';
import {
  LEAGUE_FIXTURE_SELECT,
  LEAGUE_ROUND_SELECT,
  toAgentLeagueFixture,
  toAgentLeagueRound,
} from '../dto/leagueSchedule.dto';
import { agentLeagueT } from '../i18n/agentLeagueI18n';
import { defineTool } from './registry';

const ID = z.string().min(1).max(64);

/** League read guard (also requires a real `LEAGUE_SEASON`; anything else = not found). */
export async function loadVisibleLeagueSeason(principal: AgentPrincipal, seasonId: string) {
  await assertAgentCanViewLeagueSeason(principal, seasonId);
  const game = await prisma.game.findUnique({
    where: { id: seasonId },
    select: {
      id: true,
      name: true,
      entityType: true,
      club: { select: { name: true } },
      city: { select: { timezone: true } },
      leagueSeason: { select: { id: true, league: { select: { name: true } } } },
    },
  });
  if (!game || game.entityType !== EntityType.LEAGUE_SEASON || !game.leagueSeason) {
    throw agentGameNotFound();
  }
  return { game, title: (game.name ?? '').trim() || game.leagueSeason.league.name || agentGameTitle(game) };
}

/** UTC bounds of one wall-clock day in `timezone` (DST-safe: each midnight converted separately). */
export function localDayRange(date: string, timezone: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
    throw new ApiError(400, 'date must be a real day (YYYY-MM-DD)');
  }
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  const nextDate = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  const range = { start: fromZonedTime(`${date}T00:00:00`, timezone), end: fromZonedTime(`${nextDate}T00:00:00`, timezone) };
  if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
    throw new ApiError(400, `Unknown timezone ${timezone}`);
  }
  return range;
}

const scheduleInput = z
  .object({
    seasonId: ID.describe('League season id (the season game id)'),
    roundId: ID.optional().describe('Only this round (ids from the rounds list); without it: unfinished fixtures of the season'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Only fixtures starting on this local day (YYYY-MM-DD, season city timezone), finished ones included. Use it for "today\'s / tomorrow\'s league games".',
      ),
    groupId: ID.optional().describe('Only this group (ids from get_league_season)'),
    missing: z
      .enum(['time', 'club', 'court', 'any'])
      .optional()
      .describe(
        'Only unfinished fixtures still missing this: time = no date/time set, club = no club, court = no court, any = missing any of them. Use it for "check that every game has a time / court".',
      ),
    limit: z.number().int().min(1).max(60).default(30),
  })
  .strict();

const NO_COURT: Prisma.GameWhereInput = { courtId: null, gameCourts: { none: {} } };

function missingWhere(missing: 'time' | 'club' | 'court' | 'any'): Prisma.GameWhereInput {
  if (missing === 'time') return { timeIsSet: false };
  if (missing === 'club') return { clubId: null };
  if (missing === 'court') return NO_COURT;
  return { OR: [{ timeIsSet: false }, { clubId: null }, NO_COURT] };
}

export const getLeagueScheduleTool = defineTool({
  name: 'get_league_schedule',
  description:
    'Get the schedule of a league season: its rounds (number, regular/playoff, whether the start announcement was sent) and fixtures (fixtureId, round, group, localStart/localEnd in the season city time, club, court, teams, status). With date: the fixtures of that day; with roundId: that round; with neither: the unfinished fixtures, soonest first, unscheduled last. With missing: only unfinished fixtures lacking a time, club or court (total is then the exact count of such fixtures). If hasMore is true the list is incomplete.',
  kind: 'read',
  scope: 'user',
  input: scheduleInput,
  label: (_args, locale) => agentLeagueT(locale, 'label.getLeagueSchedule'),
  handler: async (ctx, args) => {
    const { principal } = ctx;
    const { game, title } = await loadVisibleLeagueSeason(principal, args.seasonId);
    const rounds = await prisma.leagueRound.findMany({
      where: { leagueSeasonId: game.id },
      orderBy: { orderIndex: 'asc' },
      select: LEAGUE_ROUND_SELECT,
    });
    if (args.roundId && !rounds.some((round) => round.id === args.roundId)) {
      throw new ApiError(404, 'Round not found');
    }
    const timezone = game.city?.timezone || ctx.timezone;
    const day = args.date ? localDayRange(args.date, timezone) : null;
    const where: Prisma.GameWhereInput = {
      AND: [
        agentVisibleGamesWhere(principal),
        {
          parentId: game.id,
          entityType: EntityType.LEAGUE,
          ...(args.groupId ? { leagueGroupId: args.groupId } : {}),
          ...(args.roundId ? { leagueRoundId: args.roundId } : {}),
          ...(day ? { timeIsSet: true, startTime: { gte: day.start, lt: day.end } } : {}),
          ...((!args.roundId && !day) || args.missing
            ? { resultsStatus: { not: ResultsStatus.FINAL }, status: { not: GameStatus.ARCHIVED } }
            : {}),
        },
        ...(args.missing ? [missingWhere(args.missing)] : []),
      ],
    };
    const unfiltered = !args.roundId && !day && !args.missing;
    const [fixtures, total, canManage, allFixtures] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: [{ timeIsSet: 'desc' }, { startTime: 'asc' }, { id: 'asc' }],
        take: args.limit,
        select: LEAGUE_FIXTURE_SELECT,
      }),
      prisma.game.count({ where }),
      hasParentGamePermission(game.id, principal.userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], principal.isAdmin),
      unfiltered ? prisma.game.count({ where: { parentId: game.id, entityType: EntityType.LEAGUE } }) : Promise.resolve(null),
    ]);
    return {
      data: {
        seasonId: game.id,
        title,
        /** Owner/admin of the season: may reschedule fixtures and announce rounds. */
        canManage,
        rounds: rounds.map(toAgentLeagueRound),
        roundId: args.roundId ?? null,
        groupId: args.groupId ?? null,
        date: args.date ?? null,
        timezone,
        total,
        shown: fixtures.length,
        /** More fixtures match than were returned: narrow (date, round, group) or raise limit. */
        hasMore: total > fixtures.length,
        ...(unfiltered && total === 0 && allFixtures
          ? { note: `No unfinished fixtures: all ${allFixtures} fixtures of this season are finished. Pass roundId or date to list finished ones.` }
          : {}),
        fixtures: fixtures.map(toAgentLeagueFixture),
      },
      summary: agentLeagueT(ctx.locale, 'summary.schedule', { title, count: total }),
      entities: [{ type: 'league_season', id: game.id, title }],
    };
  },
});

export const LEAGUE_SCHEDULE_TOOLS = [getLeagueScheduleTool];
