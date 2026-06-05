import { WinnerOfGame } from '@prisma/client';

export interface PlayerAggregate {
  userId: string;
  level: number;
  matchesWon: number;
  wins: number;
  ties: number;
  losses: number;
  totalPoints: number;
  scoresDelta: number;
}

export type HeadToHeadMap = Map<string, Map<string, 'A' | 'B' | 'tie' | null>>;

export interface RoundResultForAggregates {
  matches: Array<{
    teams: Array<{
      teamId: string;
      teamNumber: number;
      score: number;
      playerIds: string[];
    }>;
    winnerId?: string | null;
  }>;
}

export function initializePlayerAggregate(userId: string, level: number): PlayerAggregate {
  return {
    userId,
    level,
    matchesWon: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    totalPoints: 0,
    scoresDelta: 0,
  };
}

function updateAggregateFromMatch(
  aggregate: PlayerAggregate,
  teamScore: number,
  opponentScore: number,
  teamWon: boolean,
  isTie: boolean,
): void {
  aggregate.totalPoints += teamScore;
  aggregate.scoresDelta += teamScore - opponentScore;
  if (teamWon) {
    aggregate.matchesWon++;
    aggregate.wins++;
  } else if (isTie) {
    aggregate.ties++;
  } else {
    aggregate.losses++;
  }
}

export function buildAggregatesFromRoundResults(
  players: Array<{ userId: string; level: number }>,
  roundResults: RoundResultForAggregates[],
): Map<string, PlayerAggregate> {
  const aggregates = new Map<string, PlayerAggregate>();
  for (const player of players) {
    aggregates.set(player.userId, initializePlayerAggregate(player.userId, player.level));
  }

  for (const round of roundResults) {
    for (const match of round.matches) {
      if (match.teams.length !== 2) continue;
      const teamA = match.teams.find((t) => t.teamNumber === 1) ?? match.teams[0];
      const teamB = match.teams.find((t) => t.teamNumber === 2) ?? match.teams[1];
      const validSets = match.teams.length > 0;
      if (!validSets) continue;

      const teamAWon = match.winnerId === teamA.teamId;
      const teamBWon = match.winnerId === teamB.teamId;
      const isTie = !teamAWon && !teamBWon;

      for (const playerId of teamA.playerIds) {
        const agg = aggregates.get(playerId);
        if (agg) updateAggregateFromMatch(agg, teamA.score, teamB.score, teamAWon, isTie);
      }
      for (const playerId of teamB.playerIds) {
        const agg = aggregates.get(playerId);
        if (agg) updateAggregateFromMatch(agg, teamB.score, teamA.score, teamBWon, isTie);
      }
    }
  }

  return aggregates;
}

export function buildHeadToHeadFromRoundResults(
  playerIds: string[],
  roundResults: RoundResultForAggregates[],
): HeadToHeadMap {
  const h2hMap: HeadToHeadMap = new Map();

  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const playerAId = playerIds[i];
      const playerBId = playerIds[j];
      let aWins = 0;
      let bWins = 0;

      for (const round of roundResults) {
        for (const match of round.matches) {
          const teamA = match.teams.find((t) => t.teamNumber === 1) ?? match.teams[0];
          const teamB = match.teams.find((t) => t.teamNumber === 2) ?? match.teams[1];
          if (!teamA || !teamB) continue;

          const aInTeamA = teamA.playerIds.includes(playerAId);
          const aInTeamB = teamB.playerIds.includes(playerAId);
          const bInTeamA = teamA.playerIds.includes(playerBId);
          const bInTeamB = teamB.playerIds.includes(playerBId);
          const areOpponents = (aInTeamA && bInTeamB) || (aInTeamB && bInTeamA);
          if (!areOpponents) continue;

          const teamAWon = match.winnerId === teamA.teamId;
          const teamBWon = match.winnerId === teamB.teamId;
          if (teamAWon) {
            if (aInTeamA) aWins++;
            else bWins++;
          } else if (teamBWon) {
            if (aInTeamB) aWins++;
            else bWins++;
          }
        }
      }

      let result: 'A' | 'B' | 'tie' | null = null;
      if (aWins > bWins) result = 'A';
      else if (bWins > aWins) result = 'B';
      else if (aWins === bWins && aWins > 0) result = 'tie';

      if (!h2hMap.has(playerAId)) h2hMap.set(playerAId, new Map());
      if (!h2hMap.has(playerBId)) h2hMap.set(playerBId, new Map());
      h2hMap.get(playerAId)!.set(playerBId, result);
      const reverseResult = result === 'A' ? 'B' : result === 'B' ? 'A' : result;
      h2hMap.get(playerBId)!.set(playerAId, reverseResult);
    }
  }

  return h2hMap;
}

export function calculatePointsEarnedFromAggregate(
  aggregate: PlayerAggregate,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
): number {
  return (
    aggregate.wins * pointsPerWin +
    aggregate.ties * pointsPerTie +
    aggregate.losses * pointsPerLoose
  );
}

export function comparePlayerAggregates(
  a: PlayerAggregate,
  b: PlayerAggregate,
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
  h2hResult: 'A' | 'B' | 'tie' | null = null,
): number {
  switch (winnerOfGame) {
    case WinnerOfGame.BY_MATCHES_WON: {
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      const tiesDiff = b.ties - a.ties;
      if (tiesDiff !== 0) return tiesDiff;
      const scoresDeltaDiff = b.scoresDelta - a.scoresDelta;
      if (scoresDeltaDiff !== 0) return scoresDeltaDiff;
      if (h2hResult === 'A') return -1;
      if (h2hResult === 'B') return 1;
      return a.level - b.level;
    }
    case WinnerOfGame.BY_POINTS: {
      const aPoints = calculatePointsEarnedFromAggregate(a, pointsPerWin, pointsPerTie, pointsPerLoose);
      const bPoints = calculatePointsEarnedFromAggregate(b, pointsPerWin, pointsPerTie, pointsPerLoose);
      const pointsDiff = bPoints - aPoints;
      if (pointsDiff !== 0) return pointsDiff;
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      const tiesDiff = b.ties - a.ties;
      if (tiesDiff !== 0) return tiesDiff;
      const scoresDeltaDiff = b.scoresDelta - a.scoresDelta;
      if (scoresDeltaDiff !== 0) return scoresDeltaDiff;
      if (h2hResult === 'A') return -1;
      if (h2hResult === 'B') return 1;
      return a.level - b.level;
    }
    case WinnerOfGame.BY_SCORES_DELTA: {
      const deltasDiff = b.scoresDelta - a.scoresDelta;
      if (deltasDiff !== 0) return deltasDiff;
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      const tiesDiff = b.ties - a.ties;
      if (tiesDiff !== 0) return tiesDiff;
      if (h2hResult === 'A') return -1;
      if (h2hResult === 'B') return 1;
      return a.level - b.level;
    }
    case WinnerOfGame.PLAYOFF_FINALS:
      return 0;
    default: {
      const defaultDiff = b.matchesWon - a.matchesWon;
      if (defaultDiff !== 0) return defaultDiff;
      return b.scoresDelta - a.scoresDelta;
    }
  }
}

export function sortPlayerAggregates(
  aggregates: PlayerAggregate[],
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
  h2hMap: HeadToHeadMap,
): PlayerAggregate[] {
  return [...aggregates].sort((a, b) => {
    const h2hResult = h2hMap.get(a.userId)?.get(b.userId) ?? null;
    return comparePlayerAggregates(
      a,
      b,
      winnerOfGame,
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      h2hResult,
    );
  });
}

export function arePlayerAggregatesTied(
  a: PlayerAggregate,
  b: PlayerAggregate,
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
  h2hMap: HeadToHeadMap,
): boolean {
  if (
    a.wins !== b.wins ||
    a.ties !== b.ties ||
    a.losses !== b.losses ||
    a.matchesWon !== b.matchesWon ||
    a.scoresDelta !== b.scoresDelta
  ) {
    return false;
  }
  if (winnerOfGame === WinnerOfGame.BY_POINTS) {
    const aPoints = calculatePointsEarnedFromAggregate(a, pointsPerWin, pointsPerTie, pointsPerLoose);
    const bPoints = calculatePointsEarnedFromAggregate(b, pointsPerWin, pointsPerTie, pointsPerLoose);
    if (aPoints !== bPoints) return false;
  }
  const h2h = h2hMap.get(a.userId)?.get(b.userId);
  if (h2h !== null && h2h !== 'tie' && h2h !== undefined) return false;
  if (a.level !== b.level) return false;
  return true;
}

export function assignPositionsWithTies(
  sortedPlayers: PlayerAggregate[],
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
  h2hMap: HeadToHeadMap,
): Map<string, number> {
  const positionMap = new Map<string, number>();
  let currentPosition = 1;
  let i = 0;

  while (i < sortedPlayers.length) {
    const tiedGroup: PlayerAggregate[] = [sortedPlayers[i]];
    let j = i + 1;
    while (
      j < sortedPlayers.length &&
      arePlayerAggregatesTied(
        sortedPlayers[i],
        sortedPlayers[j],
        winnerOfGame,
        pointsPerWin,
        pointsPerTie,
        pointsPerLoose,
        h2hMap,
      )
    ) {
      tiedGroup.push(sortedPlayers[j]);
      j++;
    }
    for (const player of tiedGroup) {
      positionMap.set(player.userId, currentPosition);
    }
    currentPosition += 1;
    i = j;
  }

  return positionMap;
}

export function determineWinnerUserIds(
  sortedPlayers: PlayerAggregate[],
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
): Set<string> {
  if (sortedPlayers.length === 0 || winnerOfGame === WinnerOfGame.PLAYOFF_FINALS) {
    return new Set();
  }

  const topValue = (() => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_MATCHES_WON:
        return sortedPlayers[0].matchesWon;
      case WinnerOfGame.BY_POINTS:
        return calculatePointsEarnedFromAggregate(
          sortedPlayers[0],
          pointsPerWin,
          pointsPerTie,
          pointsPerLoose,
        );
      case WinnerOfGame.BY_SCORES_DELTA:
        return sortedPlayers[0].scoresDelta;
      default:
        return sortedPlayers[0].matchesWon;
    }
  })();

  const winners = sortedPlayers.filter((p) => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_MATCHES_WON:
        return p.matchesWon === topValue;
      case WinnerOfGame.BY_POINTS:
        return (
          calculatePointsEarnedFromAggregate(p, pointsPerWin, pointsPerTie, pointsPerLoose) ===
          topValue
        );
      case WinnerOfGame.BY_SCORES_DELTA:
        return p.scoresDelta === topValue;
      default:
        return p.matchesWon === topValue;
    }
  });

  return new Set(winners.map((w) => w.userId));
}
