import { Gender, WinnerOfGame } from '@prisma/client';
import {
  assignPositionsWithTies,
  calculatePointsEarnedFromAggregate,
  comparePlayerAggregates,
  determineWinnerUserIds,
  sortPlayerAggregates,
  type HeadToHeadMap,
  type PlayerAggregate,
} from './playerAggregates';

export type PlacementContext = {
  winnerOfGame: WinnerOfGame;
  pointsPerWin: number;
  pointsPerTie: number;
  pointsPerLoose: number;
  hasFixedTeams: boolean;
  genderTeams: string | null;
  fixedTeams?: Array<{ id: string; teamNumber: number; playerIds: string[] }>;
  userGenderById?: Map<string, Gender | null>;
};

export type PlacementResult = {
  positionByUser: Map<string, number>;
  winnerUserIds: Set<string>;
};

interface TeamScore {
  teamId: string;
  teamNumber: number;
  playerIds: string[];
  matchesWon: number;
  wins: number;
  ties: number;
  losses: number;
  totalPoints: number;
  scoresDelta: number;
  pointsEarned: number;
}

function compareTeams(a: TeamScore, b: TeamScore, winnerOfGame: WinnerOfGame): number {
  switch (winnerOfGame) {
    case WinnerOfGame.BY_MATCHES_WON: {
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      const tiesDiff = b.ties - a.ties;
      if (tiesDiff !== 0) return tiesDiff;
      return b.scoresDelta - a.scoresDelta;
    }
    case WinnerOfGame.BY_POINTS: {
      const pointsDiff = b.pointsEarned - a.pointsEarned;
      if (pointsDiff !== 0) return pointsDiff;
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      const tiesDiff = b.ties - a.ties;
      if (tiesDiff !== 0) return tiesDiff;
      return b.scoresDelta - a.scoresDelta;
    }
    case WinnerOfGame.BY_SCORES_DELTA: {
      const deltasDiff = b.scoresDelta - a.scoresDelta;
      if (deltasDiff !== 0) return deltasDiff;
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      return b.ties - a.ties;
    }
    case WinnerOfGame.BY_SCORES_MADE: {
      const scoresMadeDiff = b.totalPoints - a.totalPoints;
      if (scoresMadeDiff !== 0) return scoresMadeDiff;
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      const tiesDiff = b.ties - a.ties;
      if (tiesDiff !== 0) return tiesDiff;
      return b.scoresDelta - a.scoresDelta;
    }
    default:
      return b.matchesWon - a.matchesWon || b.scoresDelta - a.scoresDelta;
  }
}

function areTeamsTied(a: TeamScore, b: TeamScore, winnerOfGame: WinnerOfGame): boolean {
  if (
    a.wins !== b.wins ||
    a.ties !== b.ties ||
    a.losses !== b.losses ||
    a.matchesWon !== b.matchesWon ||
    a.scoresDelta !== b.scoresDelta
  ) {
    return false;
  }
  if (winnerOfGame === WinnerOfGame.BY_POINTS && a.pointsEarned !== b.pointsEarned) {
    return false;
  }
  if (winnerOfGame === WinnerOfGame.BY_SCORES_MADE && a.totalPoints !== b.totalPoints) {
    return false;
  }
  return true;
}

export function computePlacementFromAggregates(
  aggregates: Map<string, PlayerAggregate>,
  h2hMap: HeadToHeadMap,
  ctx: PlacementContext,
): PlacementResult {
  const { winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose } = ctx;
  const isMixPairsWithoutFixedTeams = !ctx.hasFixedTeams && ctx.genderTeams === 'MIX_PAIRS';

  const sortPlayers = (players: PlayerAggregate[]) =>
    sortPlayerAggregates(players, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose, h2hMap);

  let winnerUserIds = determineWinnerUserIds(
    sortPlayers(Array.from(aggregates.values())),
    winnerOfGame,
    pointsPerWin,
    pointsPerTie,
    pointsPerLoose,
  );
  let playerPositionMap: Map<string, number> | null = null;

  if (isMixPairsWithoutFixedTeams && ctx.userGenderById) {
    const allPlayers = Array.from(aggregates.values());
    const malePlayers = sortPlayers(allPlayers.filter((p) => ctx.userGenderById!.get(p.userId) === 'MALE'));
    const femalePlayers = sortPlayers(allPlayers.filter((p) => ctx.userGenderById!.get(p.userId) === 'FEMALE'));
    const malePositionMap = assignPositionsWithTies(
      malePlayers,
      winnerOfGame,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      h2hMap,
    );
    const femalePositionMap = assignPositionsWithTies(
      femalePlayers,
      winnerOfGame,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      h2hMap,
    );
    winnerUserIds = new Set<string>();
    for (const player of malePlayers) {
      if (malePositionMap.get(player.userId) === 1) winnerUserIds.add(player.userId);
    }
    for (const player of femalePlayers) {
      if (femalePositionMap.get(player.userId) === 1) winnerUserIds.add(player.userId);
    }
    const maxPairs = Math.max(malePlayers.length, femalePlayers.length);
    playerPositionMap = new Map<string, number>();
    for (let i = 0; i < maxPairs; i++) {
      if (i < malePlayers.length) {
        const position = malePositionMap.get(malePlayers[i].userId);
        if (position !== undefined) playerPositionMap.set(malePlayers[i].userId, position);
      }
      if (i < femalePlayers.length) {
        const position = femalePositionMap.get(femalePlayers[i].userId);
        if (position !== undefined) playerPositionMap.set(femalePlayers[i].userId, position);
      }
    }
  } else if (ctx.hasFixedTeams && ctx.fixedTeams && ctx.fixedTeams.length > 0) {
    const teamScoresMap = new Map<string, TeamScore>();
    for (const fixedTeam of ctx.fixedTeams) {
      const teamPlayerScores = fixedTeam.playerIds
        .map((userId) => aggregates.get(userId))
        .filter((score): score is PlayerAggregate => score !== undefined);
      if (teamPlayerScores.length === 0) continue;
      teamScoresMap.set(fixedTeam.id, {
        teamId: fixedTeam.id,
        teamNumber: fixedTeam.teamNumber,
        playerIds: fixedTeam.playerIds,
        matchesWon: Math.max(...teamPlayerScores.map((p) => p.matchesWon)),
        wins: Math.max(...teamPlayerScores.map((p) => p.wins)),
        ties: Math.max(...teamPlayerScores.map((p) => p.ties)),
        losses: Math.max(...teamPlayerScores.map((p) => p.losses)),
        totalPoints: teamPlayerScores.reduce((sum, p) => sum + p.totalPoints, 0),
        scoresDelta: teamPlayerScores.reduce((sum, p) => sum + p.scoresDelta, 0),
        pointsEarned: teamPlayerScores.reduce(
          (sum, p) =>
            sum + calculatePointsEarnedFromAggregate(p, pointsPerWin, pointsPerTie, pointsPerLoose),
          0,
        ),
      });
    }
    const sortedTeams = Array.from(teamScoresMap.values()).sort((a, b) =>
      compareTeams(a, b, winnerOfGame),
    );
    const teamPositionMap = new Map<string, number>();
    let currentPosition = 1;
    let i = 0;
    while (i < sortedTeams.length) {
      const tiedGroup: TeamScore[] = [sortedTeams[i]];
      let j = i + 1;
      while (j < sortedTeams.length && areTeamsTied(sortedTeams[i], sortedTeams[j], winnerOfGame)) {
        tiedGroup.push(sortedTeams[j]);
        j++;
      }
      for (const team of tiedGroup) {
        teamPositionMap.set(team.teamId, currentPosition);
      }
      currentPosition += 1;
      i = j;
    }
    playerPositionMap = new Map<string, number>();
    winnerUserIds = new Set<string>();
    for (const team of sortedTeams) {
      const position = teamPositionMap.get(team.teamId) ?? sortedTeams.length;
      for (const playerId of team.playerIds) {
        if (aggregates.has(playerId)) {
          playerPositionMap.set(playerId, position);
          if (position === 1) winnerUserIds.add(playerId);
        }
      }
    }
  } else {
    const sortedPlayers = sortPlayers(Array.from(aggregates.values()));
    playerPositionMap = assignPositionsWithTies(
      sortedPlayers,
      winnerOfGame,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      h2hMap,
    );
  }

  return {
    positionByUser: playerPositionMap ?? new Map(),
    winnerUserIds,
  };
}

export function applyPlacementToOutcomes<T extends { userId: string; isWinner?: boolean; position?: number }>(
  outcomes: T[],
  placement: PlacementResult,
): T[] {
  return outcomes.map((outcome) => ({
    ...outcome,
    isWinner: placement.winnerUserIds.has(outcome.userId),
    position: placement.positionByUser.get(outcome.userId) ?? outcome.position,
  }));
}

/** Standalone winner ordering for tests — same comparator chain as placement. */
export function orderPlayerIdsByWinnerRule(
  aggregates: Map<string, PlayerAggregate>,
  h2hMap: HeadToHeadMap,
  ctx: Pick<PlacementContext, 'winnerOfGame' | 'pointsPerWin' | 'pointsPerTie' | 'pointsPerLoose'>,
): string[] {
  return sortPlayerAggregates(
    Array.from(aggregates.values()),
    ctx.winnerOfGame,
    ctx.pointsPerWin,
    ctx.pointsPerTie,
    ctx.pointsPerLoose,
    h2hMap,
  ).map((p) => p.userId);
}

export { comparePlayerAggregates };
