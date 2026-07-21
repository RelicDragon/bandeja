import {
  EntityType,
  Prisma,
  ResultsStatus,
  RoundType,
} from '@prisma/client';
import { getMatchScoresForDelta } from '../results/setScoreDelta';
import { isOfficialMatchSetRole } from '../results/matchSetRole';
import { sortedPlayerKey } from './leagueParticipantResolve';
import { loadSeasonRosterAliasMap } from './leagueTeamRosterAlias.util';
import type { LeagueGroupStandingsMode } from './leagueGroupStandingsMode';
import type { RankFixture, RankParticipant } from './leagueGroupStandingsRank.util';
import {
  orderByRankedIds,
  rankFixedTeamGroupStandings,
} from './leagueGroupStandingsRank.util';

type Tx = Prisma.TransactionClient | typeof import('../../config/database').default;

export type GroupStandingRow = {
  id: string;
  wins: number;
  currentGroupId: string | null;
  userId?: string | null;
  leagueTeamId?: string | null;
  leagueTeam?: { players: { userId: string }[] } | null;
};

/** @deprecated Use GroupStandingRow */
export type TeamStandingRow = GroupStandingRow;

function buildRosterToTeamIdMap(
  participants: GroupStandingRow[],
  aliasMap: Map<string, string>
): Map<string, string> {
  const rosterToTeam = new Map<string, string>(aliasMap);
  for (const p of participants) {
    if (!p.leagueTeamId || !p.leagueTeam?.players?.length) continue;
    const key = sortedPlayerKey(p.leagueTeam.players.map((pl) => pl.userId));
    if (key) rosterToTeam.set(key, p.leagueTeamId);
  }
  return rosterToTeam;
}

function teamIdToParticipantId(participants: GroupStandingRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of participants) {
    if (p.leagueTeamId) m.set(p.leagueTeamId, p.id);
  }
  return m;
}

function userIdToParticipantId(participants: GroupStandingRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of participants) {
    if (p.userId) m.set(p.userId, p.id);
  }
  return m;
}

function resolveTeamParticipantId(
  playerIds: string[],
  rosterToTeam: Map<string, string>,
  teamToParticipant: Map<string, string>
): string | null {
  const key = sortedPlayerKey(playerIds);
  if (!key) return null;
  const teamId = rosterToTeam.get(key);
  if (!teamId) return null;
  return teamToParticipant.get(teamId) ?? null;
}

/** 1v1 side: exactly one player → USER participant. */
function resolveSinglesParticipantId(
  playerIds: string[],
  userToParticipant: Map<string, string>
): string | null {
  if (playerIds.length !== 1) return null;
  return userToParticipant.get(playerIds[0]) ?? null;
}

function matchSetSideScores(sets: {
  teamAScore: number;
  teamBScore: number;
  role: Parameters<typeof isOfficialMatchSetRole>[0];
  isTieBreak: boolean;
}[]): {
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
} {
  const official = sets.filter(
    (s) => isOfficialMatchSetRole(s.role) && (s.teamAScore > 0 || s.teamBScore > 0)
  );
  let setsA = 0;
  let setsB = 0;
  for (const s of official) {
    if (s.teamAScore > s.teamBScore) setsA += 1;
    else if (s.teamBScore > s.teamAScore) setsB += 1;
  }
  const { teamAScore: gamesA, teamBScore: gamesB } = getMatchScoresForDelta(
    official.map((s) => ({
      teamAScore: s.teamAScore,
      teamBScore: s.teamBScore,
      isTieBreak: s.isTieBreak,
    }))
  );
  return { setsA, setsB, gamesA, gamesB };
}

function outcomeMatchWinsForPlayers(
  outcomes: { userId: string; wins: number }[],
  sideAUserIds: string[],
  sideBUserIds: string[]
): { winsA: number; winsB: number } {
  const outcomeByUser = new Map(outcomes.map((o) => [o.userId, o]));
  const teamWins = (userIds: string[]) => {
    let w = 0;
    for (const uid of userIds) {
      const o = outcomeByUser.get(uid);
      if (o) w = Math.max(w, o.wins ?? 0);
    }
    return w;
  };
  return { winsA: teamWins(sideAUserIds), winsB: teamWins(sideBUserIds) };
}

function pushOutcomeOnlyFixtures(
  fixtures: RankFixture[],
  aId: string,
  bId: string,
  winsA: number,
  winsB: number
): void {
  for (let i = 0; i < winsA; i++) {
    fixtures.push({
      aId,
      bId,
      winnerId: aId,
      setsA: 0,
      setsB: 0,
      gamesA: 0,
      gamesB: 0,
    });
  }
  for (let i = 0; i < winsB; i++) {
    fixtures.push({
      aId,
      bId,
      winnerId: bId,
      setsA: 0,
      setsB: 0,
      gamesA: 0,
      gamesB: 0,
    });
  }
}

const fixtureGameSelect = {
  id: true,
  fixedTeams: {
    select: {
      teamNumber: true,
      players: { select: { userId: true } },
    },
    orderBy: { teamNumber: 'asc' as const },
  },
  participants: {
    where: { status: 'PLAYING' as const },
    select: { userId: true },
  },
  outcomes: {
    select: { userId: true, wins: true, losses: true },
  },
  rounds: {
    select: {
      matches: {
        select: {
          winnerId: true,
          teams: {
            select: {
              id: true,
              teamNumber: true,
              players: { select: { userId: true } },
            },
          },
          sets: {
            select: {
              teamAScore: true,
              teamBScore: true,
              isTieBreak: true,
              role: true,
              setNumber: true,
            },
            orderBy: { setNumber: 'asc' as const },
          },
        },
        orderBy: { matchNumber: 'asc' as const },
      },
    },
    orderBy: { roundNumber: 'asc' as const },
  },
};

/** Season-wide REGULAR fixtures (group filter applied later via participant idSet). */
async function loadSeasonRegularFixtureGames(tx: Tx, leagueSeasonId: string) {
  return tx.game.findMany({
    where: {
      entityType: EntityType.LEAGUE,
      parentId: leagueSeasonId,
      leagueGroupId: { not: null },
      leagueRoundId: { not: null },
      leagueRound: {
        leagueSeasonId,
        roundType: RoundType.REGULAR,
      },
      OR: [
        { outcomes: { some: {} } },
        {
          rounds: {
            some: {
              matches: { some: { winnerId: { not: null } } },
            },
          },
        },
      ],
      resultsStatus: { in: [ResultsStatus.FINAL, ResultsStatus.IN_PROGRESS] },
    },
    select: fixtureGameSelect,
  });
}

type FixtureGame = Awaited<ReturnType<typeof loadSeasonRegularFixtureGames>>[number];

type PairSides = {
  aId: string;
  bId: string;
  sideAUserIds: string[];
  sideBUserIds: string[];
};

function emitMatchFixturesForPair(
  fixtures: RankFixture[],
  game: FixtureGame,
  aId: string,
  bId: string,
  resolveSide: (playerIds: string[]) => string | null
): { winsA: number; winsB: number } {
  let winsA = 0;
  let winsB = 0;
  for (const round of game.rounds) {
    for (const match of round.matches) {
      if (!match.winnerId) continue;

      const team1 = match.teams.find((t) => t.teamNumber === 1) ?? match.teams[0];
      const team2 = match.teams.find((t) => t.teamNumber === 2) ?? match.teams[1];
      if (!team1 || !team2) continue;

      const mA = resolveSide(team1.players.map((p) => p.userId));
      const mB = resolveSide(team2.players.map((p) => p.userId));
      if (!mA || !mB) continue;
      if (!(mA === aId && mB === bId) && !(mA === bId && mB === aId)) continue;

      const winTeam = match.teams.find((t) => t.id === match.winnerId);
      if (!winTeam) continue;
      const wPid = resolveSide(winTeam.players.map((p) => p.userId));
      if (wPid !== aId && wPid !== bId) continue;

      const flipped = mA === bId;
      const scores = matchSetSideScores(match.sets);
      fixtures.push({
        aId,
        bId,
        winnerId: wPid,
        setsA: flipped ? scores.setsB : scores.setsA,
        setsB: flipped ? scores.setsA : scores.setsB,
        gamesA: flipped ? scores.gamesB : scores.gamesA,
        gamesB: flipped ? scores.gamesA : scores.gamesB,
      });
      if (wPid === aId) winsA += 1;
      else winsB += 1;
    }
  }
  return { winsA, winsB };
}

/** Top up H2H when outcomes report more match wins than decided Match rows. */
function reconcileOutcomeWins(
  fixtures: RankFixture[],
  aId: string,
  bId: string,
  emitted: { winsA: number; winsB: number },
  outcomes: { userId: string; wins: number }[],
  sideAUserIds: string[],
  sideBUserIds: string[]
): void {
  const { winsA: oA, winsB: oB } = outcomeMatchWinsForPlayers(
    outcomes,
    sideAUserIds,
    sideBUserIds
  );
  pushOutcomeOnlyFixtures(
    fixtures,
    aId,
    bId,
    Math.max(0, oA - emitted.winsA),
    Math.max(0, oB - emitted.winsB)
  );
}

function derivePairFromFixedTeams(
  game: FixtureGame,
  resolveSide: (playerIds: string[]) => string | null
): PairSides | null {
  if (game.fixedTeams.length < 2) return null;
  const ft1 = game.fixedTeams[0];
  const ft2 = game.fixedTeams[1];
  const sideAUserIds = ft1.players.map((p) => p.userId);
  const sideBUserIds = ft2.players.map((p) => p.userId);
  const aId = resolveSide(sideAUserIds);
  const bId = resolveSide(sideBUserIds);
  if (!aId || !bId || aId === bId) return null;
  return { aId, bId, sideAUserIds, sideBUserIds };
}

function derivePairFromMatches(
  game: FixtureGame,
  resolveSide: (playerIds: string[]) => string | null
): PairSides | null {
  for (const round of game.rounds) {
    for (const match of round.matches) {
      const team1 = match.teams.find((t) => t.teamNumber === 1) ?? match.teams[0];
      const team2 = match.teams.find((t) => t.teamNumber === 2) ?? match.teams[1];
      if (!team1 || !team2) continue;
      const sideAUserIds = team1.players.map((p) => p.userId);
      const sideBUserIds = team2.players.map((p) => p.userId);
      const aId = resolveSide(sideAUserIds);
      const bId = resolveSide(sideBUserIds);
      if (!aId || !bId || aId === bId) continue;
      return { aId, bId, sideAUserIds, sideBUserIds };
    }
  }
  return null;
}

function deriveSinglesPairFromParticipants(
  game: FixtureGame,
  userToParticipant: Map<string, string>
): PairSides | null {
  const playing = [
    ...new Set(
      game.participants
        .map((p) => p.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ].sort();
  if (playing.length !== 2) return null;
  const aId = userToParticipant.get(playing[0]);
  const bId = userToParticipant.get(playing[1]);
  if (!aId || !bId || aId === bId) return null;
  return {
    aId,
    bId,
    sideAUserIds: [playing[0]],
    sideBUserIds: [playing[1]],
  };
}

function deriveSinglesPairFromOutcomes(
  game: FixtureGame,
  userToParticipant: Map<string, string>
): PairSides | null {
  const fromOutcomes = [
    ...new Set(game.outcomes.map((o) => o.userId).filter((id) => userToParticipant.has(id))),
  ].sort();
  if (fromOutcomes.length !== 2) return null;
  const aId = userToParticipant.get(fromOutcomes[0]);
  const bId = userToParticipant.get(fromOutcomes[1]);
  if (!aId || !bId || aId === bId) return null;
  return {
    aId,
    bId,
    sideAUserIds: [fromOutcomes[0]],
    sideBUserIds: [fromOutcomes[1]],
  };
}

function emitGamePairFixtures(
  fixtures: RankFixture[],
  game: FixtureGame,
  pair: PairSides,
  resolveSide: (playerIds: string[]) => string | null
): void {
  const emitted = emitMatchFixturesForPair(fixtures, game, pair.aId, pair.bId, resolveSide);
  reconcileOutcomeWins(
    fixtures,
    pair.aId,
    pair.bId,
    emitted,
    game.outcomes,
    pair.sideAUserIds,
    pair.sideBUserIds
  );
}

export async function loadFixedTeamGroupFixtures(
  tx: Tx,
  leagueSeasonId: string,
  participants: GroupStandingRow[]
): Promise<RankFixture[]> {
  if (participants.length === 0) return [];

  const [aliasMap, games] = await Promise.all([
    loadSeasonRosterAliasMap(tx, leagueSeasonId),
    loadSeasonRegularFixtureGames(tx, leagueSeasonId),
  ]);

  const rosterToTeam = buildRosterToTeamIdMap(participants, aliasMap);
  const teamToParticipant = teamIdToParticipantId(participants);
  const resolveSide = (playerIds: string[]) =>
    resolveTeamParticipantId(playerIds, rosterToTeam, teamToParticipant);
  const fixtures: RankFixture[] = [];

  for (const game of games) {
    const pair =
      derivePairFromFixedTeams(game, resolveSide) ?? derivePairFromMatches(game, resolveSide);
    if (!pair) continue;
    emitGamePairFixtures(fixtures, game, pair, resolveSide);
  }

  return fixtures;
}

/**
 * 1v1 USER leagues: each match side must be exactly one player.
 * Skips any side with ≠1 players (avoids 2v2 non-fixed contamination).
 */
export async function loadUserSinglesGroupFixtures(
  tx: Tx,
  leagueSeasonId: string,
  participants: GroupStandingRow[]
): Promise<RankFixture[]> {
  if (participants.length === 0) return [];

  const games = await loadSeasonRegularFixtureGames(tx, leagueSeasonId);
  const userToParticipant = userIdToParticipantId(participants);
  const resolveSide = (playerIds: string[]) =>
    resolveSinglesParticipantId(playerIds, userToParticipant);
  const fixtures: RankFixture[] = [];

  for (const game of games) {
    const pair =
      derivePairFromFixedTeams(game, resolveSide) ??
      derivePairFromMatches(game, resolveSide) ??
      deriveSinglesPairFromParticipants(game, userToParticipant) ??
      deriveSinglesPairFromOutcomes(game, userToParticipant);
    if (!pair) continue;
    // Reject non-singles sides (pair may come from fixedTeams with 2 players on a side).
    if (pair.sideAUserIds.length !== 1 || pair.sideBUserIds.length !== 1) continue;
    emitGamePairFixtures(fixtures, game, pair, resolveSide);
  }

  return fixtures;
}

export async function applyGroupStandingsTiebreakers<T extends GroupStandingRow>(
  tx: Tx,
  leagueSeasonId: string,
  participants: T[],
  mode: LeagueGroupStandingsMode
): Promise<T[]> {
  if (participants.length <= 1) return participants;

  const fixtures =
    mode === 'fixedTeam'
      ? await loadFixedTeamGroupFixtures(tx, leagueSeasonId, participants)
      : await loadUserSinglesGroupFixtures(tx, leagueSeasonId, participants);

  const byGroup = new Map<string | null, T[]>();
  for (const p of participants) {
    const key = p.currentGroupId;
    const list = byGroup.get(key);
    if (list) list.push(p);
    else byGroup.set(key, [p]);
  }

  const ranked: T[] = [];
  const groupKeys: (string | null)[] = [];
  const seen = new Set<string | null>();
  for (const p of participants) {
    if (!seen.has(p.currentGroupId)) {
      seen.add(p.currentGroupId);
      groupKeys.push(p.currentGroupId);
    }
  }

  for (const key of groupKeys) {
    const rows = byGroup.get(key)!;
    if (rows.length <= 1) {
      ranked.push(...rows);
      continue;
    }
    const idSet = new Set(rows.map((r) => r.id));
    const rankInput: RankParticipant[] = rows.map((r) => ({ id: r.id, wins: r.wins }));
    const groupFixtures = fixtures.filter((f) => idSet.has(f.aId) && idSet.has(f.bId));
    const orderedIds = rankFixedTeamGroupStandings(rankInput, groupFixtures);
    ranked.push(...orderByRankedIds(rows, orderedIds));
  }

  return ranked;
}

/** @deprecated Prefer applyGroupStandingsTiebreakers(..., 'fixedTeam') */
export async function applyFixedTeamStandingsTiebreakers<T extends GroupStandingRow>(
  tx: Tx,
  leagueSeasonId: string,
  participants: T[]
): Promise<T[]> {
  return applyGroupStandingsTiebreakers(tx, leagueSeasonId, participants, 'fixedTeam');
}
