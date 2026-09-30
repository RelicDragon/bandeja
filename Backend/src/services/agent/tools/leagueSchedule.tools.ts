/**
 * `get_league_schedule` (phase 4a read): rounds and fixtures of a league season.
 * Guard: `assertAgentCanViewLeagueSeason` — leagues are for everyone, so any principal
 * reads any season's schedule (like `GET /leagues/:id/rounds`). Fixtures are still ANDed
 * with `agentVisibleGamesWhere`, which treats children of a season as league content
 * (visible to all), so the listing and `get_game` on a fixture always agree.
 */
import { EntityType, GameStatus, ParticipantRole, ResultsStatus, type Prisma } from '@prisma/client';
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
      leagueSeason: { select: { id: true, league: { select: { name: true } } } },
    },
  });
  if (!game || game.entityType !== EntityType.LEAGUE_SEASON || !game.leagueSeason) {
    throw agentGameNotFound();
  }
  return { game, title: (game.name ?? '').trim() || game.leagueSeason.league.name || agentGameTitle(game) };
}

const scheduleInput = z
  .object({
    seasonId: ID.describe('League season id (the season game id)'),
    roundId: ID.optional().describe('Only this round (ids from the rounds list); without it: unfinished fixtures of the season'),
    groupId: ID.optional().describe('Only this group (ids from get_league_season)'),
    limit: z.number().int().min(1).max(60).default(30),
  })
  .strict();

export const getLeagueScheduleTool = defineTool({
  name: 'get_league_schedule',
  description:
    'Get the schedule of a league season: its rounds (number, regular/playoff, whether the start announcement was sent) and fixtures (fixtureId, round, group, time, club, court, teams, status). Without roundId lists the unfinished fixtures, soonest first, unscheduled last.',
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
    const where: Prisma.GameWhereInput = {
      AND: [
        agentVisibleGamesWhere(principal),
        {
          parentId: game.id,
          entityType: EntityType.LEAGUE,
          ...(args.groupId ? { leagueGroupId: args.groupId } : {}),
          ...(args.roundId
            ? { leagueRoundId: args.roundId }
            : { resultsStatus: { not: ResultsStatus.FINAL }, status: { not: GameStatus.ARCHIVED } }),
        },
      ],
    };
    const [fixtures, total, canManage] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: [{ timeIsSet: 'desc' }, { startTime: 'asc' }, { id: 'asc' }],
        take: args.limit,
        select: LEAGUE_FIXTURE_SELECT,
      }),
      prisma.game.count({ where }),
      hasParentGamePermission(game.id, principal.userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], principal.isAdmin),
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
        total,
        fixtures: fixtures.map(toAgentLeagueFixture),
      },
      summary: agentLeagueT(ctx.locale, 'summary.schedule', { title, count: total }),
      entities: [{ type: 'league_season', id: game.id, title }],
    };
  },
});

export const LEAGUE_SCHEDULE_TOOLS = [getLeagueScheduleTool];
