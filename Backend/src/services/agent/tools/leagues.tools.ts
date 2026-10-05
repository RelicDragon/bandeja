/**
 * League read tools: `get_league_season`, `get_league_standings`.
 * HTTP `GET /leagues/:id/standings` checks no visibility, and neither does the agent beyond
 * existence: leagues are for everyone (`assertAgentCanViewLeagueSeason`).
 */
import { EntityType, ParticipantStatus } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod/v4';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { LeagueReadService } from '../../league/read.service';
import { assertAgentCanViewLeagueSeason } from '../access/agentGameAccess';
import { agentGameSummarySelect, agentGameTitle, toAgentGameSummary, truncateUserText } from '../dto/game.dto';
import { agentUserDisplayName, roundLevel } from '../dto/user.dto';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { agentT } from '../i18n/agentI18n';
import { defineTool } from './registry';

const seasonInput = z.object({
  seasonId: z.string().min(1).max(64).describe('League season id (the season game id)'),
});

/** Newest players returned by `get_league_season` ("who joined last?"). */
const RECENT_JOINS = 10;

/** League read guard, then load the season (anything that is not a real season = not found). */
async function loadVisibleSeasonGame(principal: AgentPrincipal, seasonId: string) {
  await assertAgentCanViewLeagueSeason(principal, seasonId);
  const game = await prisma.game.findUnique({
    where: { id: seasonId },
    select: {
      ...agentGameSummarySelect(principal.userId),
      description: true,
      leagueSeason: {
        select: {
          id: true,
          orderIndex: true,
          league: { select: { id: true, name: true } },
          groups: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
          _count: { select: { participants: true, rounds: true } },
        },
      },
    },
  });
  if (!game || game.entityType !== EntityType.LEAGUE_SEASON || !game.leagueSeason) {
    throw new ApiError(404, 'Game not found');
  }
  return { game, season: game.leagueSeason };
}

function formatJoined(at: Date, timezone: string | null | undefined): string {
  try {
    return formatInTimeZone(at, timezone || 'UTC', 'EEE yyyy-MM-dd HH:mm');
  } catch {
    return at.toISOString();
  }
}

export const getLeagueSeasonTool = defineTool({
  name: 'get_league_season',
  description:
    'Get a league season: league name, dates, groups, number of rounds and participants, and the newest players (recentlyJoined, newest first, with the local join time) for "who joined last / who is new".',
  kind: 'read',
  scope: 'user',
  input: seasonInput.strict(),
  label: (_args, locale) => agentT(locale, 'label.getLeagueSeason'),
  handler: async (ctx, args) => {
    const { game, season } = await loadVisibleSeasonGame(ctx.principal, args.seasonId);
    const title = agentGameTitle(game);
    const recent = await prisma.gameParticipant.findMany({
      where: { gameId: game.id, status: ParticipantStatus.PLAYING },
      orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
      take: RECENT_JOINS,
      select: { joinedAt: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return {
      data: {
        ...toAgentGameSummary(game),
        seasonId: season.id,
        leagueName: season.league.name,
        seasonNumber: season.orderIndex + 1,
        description: truncateUserText(game.description),
        groups: season.groups.map((group) => ({ groupId: group.id, name: group.name })),
        roundsCount: season._count.rounds,
        participantsCount: season._count.participants,
        recentlyJoined: recent.map((p) => ({
          userId: p.user.id,
          name: agentUserDisplayName(p.user),
          joinedLocal: formatJoined(p.joinedAt, game.city?.timezone),
        })),
      },
      summary: title,
      entities: [{ type: 'league_season', id: season.id, title }],
    };
  },
});

type StandingsUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  level?: number | null;
};

type StandingsRow = {
  id: string;
  participantType: string;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  scoreDelta: number;
  withdrawnAt: Date | null;
  user?: StandingsUser | null;
  leagueTeam?: { players?: { user?: StandingsUser | null }[] } | null;
  currentGroup?: { id: string; name: string } | null;
};

/** "Ana (2.5) / Bo (3)": names with levels, one string per row (ids via search_players). */
function standingsPlayers(row: StandingsRow): string {
  const users = row.user ? [row.user] : (row.leagueTeam?.players ?? []).map((p) => p.user).filter(Boolean);
  return (users as StandingsUser[])
    .map((user) => {
      const level = roundLevel(user.level ?? null);
      return level != null ? `${agentUserDisplayName(user)} (${level})` : agentUserDisplayName(user);
    })
    .join(' / ');
}

/** Positional row layout of `get_league_standings` (a header + arrays keeps 100 rows inside one result). */
export const STANDINGS_COLUMNS = ['rank', 'groupRank', 'group', 'players', 'wins', 'ties', 'losses', 'points', 'scoreDiff', 'withdrawn'] as const;

export const getLeagueStandingsTool = defineTool({
  name: 'get_league_standings',
  description:
    'Get the standings table of a league season (optionally one group). Rows are arrays in the order of `columns`: rank (overall), groupRank (place within its group, null without groups), group name, players ("Name (level) / Name (level)"), wins, ties, losses, points, score difference, withdrawn. The whole table fits (up to 100 rows). "Who leads" in a season with groups means the groupRank 1 row of each group. For a player\'s id use search_players.',
  kind: 'read',
  scope: 'user',
  input: seasonInput.extend({
    groupId: z.string().min(1).max(64).optional(),
    limit: z.number().int().min(1).max(100).default(100),
  }).strict(),
  label: (_args, locale) => agentT(locale, 'label.getLeagueStandings'),
  handler: async (ctx, args) => {
    const { game, season } = await loadVisibleSeasonGame(ctx.principal, args.seasonId);
    const payload = await LeagueReadService.getLeagueStandings(season.id);
    const rows = payload.standings as unknown as StandingsRow[];
    const filtered = args.groupId ? rows.filter((row) => row.currentGroup?.id === args.groupId) : rows;
    const placeInGroup = new Map<string, number>();
    const standings = filtered.slice(0, args.limit).map((row, index) => {
      const groupKey = row.currentGroup?.id ?? '';
      const groupRank = (placeInGroup.get(groupKey) ?? 0) + 1;
      placeInGroup.set(groupKey, groupRank);
      return [
        index + 1,
        row.currentGroup ? groupRank : null,
        row.currentGroup?.name ?? null,
        standingsPlayers(row),
        row.wins,
        row.ties,
        row.losses,
        row.points,
        row.scoreDelta,
        row.withdrawnAt != null,
      ];
    });
    const groups = new Map<string, string>();
    for (const row of filtered) if (row.currentGroup) groups.set(row.currentGroup.id, row.currentGroup.name);
    const title = agentGameTitle(game);
    return {
      data: {
        seasonId: season.id,
        leagueName: season.league.name,
        title,
        groupId: args.groupId ?? null,
        groups: [...groups].map(([groupId, name]) => ({ groupId, name })),
        total: filtered.length,
        shown: standings.length,
        columns: STANDINGS_COLUMNS,
        standings,
      },
      summary: agentT(ctx.locale, 'summary.standings', { title, count: filtered.length }),
      entities: [{ type: 'league_season', id: season.id, title }],
    };
  },
});

export const LEAGUE_TOOLS = [getLeagueSeasonTool, getLeagueStandingsTool];
