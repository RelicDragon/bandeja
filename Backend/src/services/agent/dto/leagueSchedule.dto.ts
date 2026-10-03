/**
 * Agent-facing league schedule shapes (`get_league_schedule`, league write previews).
 * Whitelisted selects: fixture time/place/status and public player names only; no
 * scores, no payment fields, no booking provider data.
 */
import { ParticipantStatus, type Prisma } from '@prisma/client';
import { agentLocalTimes } from './game.dto';
import { agentUserDisplayName } from './user.dto';

const SCHEDULE_USER_SELECT = { id: true, firstName: true, lastName: true } satisfies Prisma.UserSelect;

export const LEAGUE_FIXTURE_SELECT = {
  id: true,
  name: true,
  entityType: true,
  status: true,
  resultsStatus: true,
  startTime: true,
  endTime: true,
  timeIsSet: true,
  hasFixedTeams: true,
  leagueRoundId: true,
  club: { select: { id: true, name: true } },
  court: { select: { id: true, name: true } },
  city: { select: { timezone: true } },
  leagueRound: { select: { id: true, orderIndex: true, roundType: true } },
  leagueGroup: { select: { id: true, name: true } },
  fixedTeams: {
    orderBy: { teamNumber: 'asc' },
    select: { teamNumber: true, players: { select: { user: { select: SCHEDULE_USER_SELECT } } } },
  },
  participants: {
    where: { status: ParticipantStatus.PLAYING },
    orderBy: { joinedAt: 'asc' },
    select: { user: { select: SCHEDULE_USER_SELECT } },
  },
} satisfies Prisma.GameSelect;

export type LeagueFixtureRow = Prisma.GameGetPayload<{ select: typeof LEAGUE_FIXTURE_SELECT }>;

type SchedulePlayer = { userId: string; name: string };

/** Fixed teams in team order; otherwise one "team" with the PLAYING roster. */
export function leagueFixtureTeams(row: Pick<LeagueFixtureRow, 'hasFixedTeams' | 'fixedTeams' | 'participants'>): SchedulePlayer[][] {
  const card = (user: { id: string; firstName: string | null; lastName: string | null }) => ({
    userId: user.id,
    name: agentUserDisplayName(user),
  });
  if (row.hasFixedTeams && row.fixedTeams.length > 0) {
    return row.fixedTeams.map((team) => team.players.map((player) => card(player.user)));
  }
  const players = row.participants.map((p) => card(p.user));
  return players.length > 0 ? [players] : [];
}

/** "Ana / Bo vs Cy / Di" (or the roster, or the fixture name) for previews and summaries. */
export function leagueFixtureLabel(row: Pick<LeagueFixtureRow, 'name' | 'hasFixedTeams' | 'fixedTeams' | 'participants'>): string | null {
  const teams = leagueFixtureTeams(row).filter((team) => team.length > 0);
  if (teams.length > 0) {
    return teams.map((team) => team.map((player) => player.name).join(' / ')).join(' vs ');
  }
  const name = (row.name ?? '').trim();
  return name || null;
}

export function toAgentLeagueFixture(row: LeagueFixtureRow) {
  return {
    fixtureId: row.id,
    roundId: row.leagueRound?.id ?? null,
    roundNumber: row.leagueRound ? row.leagueRound.orderIndex + 1 : null,
    roundType: row.leagueRound?.roundType ?? null,
    group: row.leagueGroup ? { groupId: row.leagueGroup.id, name: row.leagueGroup.name } : null,
    startTime: row.timeIsSet ? row.startTime.toISOString() : null,
    endTime: row.timeIsSet ? row.endTime.toISOString() : null,
    ...agentLocalTimes(row, row.city?.timezone),
    timeIsSet: row.timeIsSet,
    cityTimezone: row.city?.timezone ?? null,
    clubId: row.club?.id ?? null,
    clubName: row.club?.name ?? null,
    courtId: row.court?.id ?? null,
    courtName: row.court?.name ?? null,
    status: row.status,
    resultsStatus: row.resultsStatus,
    teams: leagueFixtureTeams(row),
  };
}

export const LEAGUE_ROUND_SELECT = {
  id: true,
  orderIndex: true,
  roundType: true,
  playoffFormat: true,
  sentStartMessage: true,
  _count: { select: { games: true } },
} satisfies Prisma.LeagueRoundSelect;

export type LeagueRoundRow = Prisma.LeagueRoundGetPayload<{ select: typeof LEAGUE_ROUND_SELECT }>;

export function toAgentLeagueRound(row: LeagueRoundRow) {
  return {
    roundId: row.id,
    roundNumber: row.orderIndex + 1,
    roundType: row.roundType,
    playoffFormat: row.playoffFormat,
    startMessageSent: row.sentStartMessage,
    fixturesCount: row._count.games,
  };
}
