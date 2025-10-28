import { calculateRatingUpdate, calculateAmericanoRating } from './rating.service';
import { GameType } from '@prisma/client';

interface PlayerData {
  userId: string;
  level: number;
  reliability: number;
  gamesPlayed: number;
}

interface TeamScore {
  teamId: string;
  score: number;
  playerIds: string[];
}

interface MatchResultData {
  teams: TeamScore[];
  winnerId?: string | null;
}

interface RoundResultData {
  matches: MatchResultData[];
}

export interface GameOutcomeResult {
  userId: string;
  levelChange: number;
  reliabilityChange: number;
  pointsEarned: number;
  isWinner: boolean;
  position?: number;
}

export interface RoundOutcomeResult {
  userId: string;
  levelChange: number;
}

export function calculateClassicGameOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[],
  _gameType: GameType
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const roundOutcomes: Record<number, RoundOutcomeResult[]> = {};
  const playerTotalChanges: Record<string, { levelChange: number; reliabilityChange: number; pointsEarned: number }> = {};

  for (const player of players) {
    playerTotalChanges[player.userId] = {
      levelChange: 0,
      reliabilityChange: 0,
      pointsEarned: 0,
    };
  }

  roundResults.forEach((roundResult, roundIndex) => {
    const roundPlayerOutcomes: Record<string, number> = {};

    for (const player of players) {
      roundPlayerOutcomes[player.userId] = 0;
    }

    for (const match of roundResult.matches) {
      if (match.teams.length !== 2) continue;

      const [teamA, teamB] = match.teams;
      const teamAWins = match.winnerId === teamA.teamId;
      const teamBWins = match.winnerId === teamB.teamId;

      const teamAPlayers = players.filter(p => teamA.playerIds.includes(p.userId));
      const teamBPlayers = players.filter(p => teamB.playerIds.includes(p.userId));

      const teamAAvgLevel = teamAPlayers.reduce((sum, p) => sum + p.level, 0) / teamAPlayers.length;
      const teamBAvgLevel = teamBPlayers.reduce((sum, p) => sum + p.level, 0) / teamBPlayers.length;

      for (const player of teamAPlayers) {
        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[player.userId].levelChange,
            reliability: player.reliability + playerTotalChanges[player.userId].reliabilityChange,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamAWins,
            opponentsLevel: teamBAvgLevel,
          }
        );

        roundPlayerOutcomes[player.userId] += update.levelChange;
        playerTotalChanges[player.userId].levelChange += update.levelChange;
        playerTotalChanges[player.userId].reliabilityChange += update.reliabilityChange;
        playerTotalChanges[player.userId].pointsEarned += update.pointsEarned;
      }

      for (const player of teamBPlayers) {
        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[player.userId].levelChange,
            reliability: player.reliability + playerTotalChanges[player.userId].reliabilityChange,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamBWins,
            opponentsLevel: teamAAvgLevel,
          }
        );

        roundPlayerOutcomes[player.userId] += update.levelChange;
        playerTotalChanges[player.userId].levelChange += update.levelChange;
        playerTotalChanges[player.userId].reliabilityChange += update.reliabilityChange;
        playerTotalChanges[player.userId].pointsEarned += update.pointsEarned;
      }
    }

    roundOutcomes[roundIndex] = Object.entries(roundPlayerOutcomes).map(([userId, levelChange]) => ({
      userId,
      levelChange,
    }));
  });

  const sortedPlayers = players
    .map(p => ({
      ...p,
      totalChange: playerTotalChanges[p.userId].levelChange,
    }))
    .sort((a, b) => b.totalChange - a.totalChange);

  const gameOutcomes: GameOutcomeResult[] = sortedPlayers.map((player, index) => ({
    userId: player.userId,
    levelChange: playerTotalChanges[player.userId].levelChange,
    reliabilityChange: playerTotalChanges[player.userId].reliabilityChange,
    pointsEarned: playerTotalChanges[player.userId].pointsEarned,
    isWinner: index === 0,
    position: index + 1,
  }));

  return { gameOutcomes, roundOutcomes };
}

export function calculateAmericanoGameOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[]
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const roundOutcomes: Record<number, RoundOutcomeResult[]> = {};
  const playerTotalChanges: Record<string, { levelChange: number; reliabilityChange: number; pointsEarned: number; totalScore: number }> = {};

  for (const player of players) {
    playerTotalChanges[player.userId] = {
      levelChange: 0,
      reliabilityChange: 0,
      pointsEarned: 0,
      totalScore: 0,
    };
  }

  roundResults.forEach((roundResult, roundIndex) => {
    const roundPlayerOutcomes: Record<string, number> = {};

    for (const player of players) {
      roundPlayerOutcomes[player.userId] = 0;
    }

    for (const match of roundResult.matches) {
      if (match.teams.length !== 2) continue;

      const [teamA, teamB] = match.teams;
      const scoreDeltaA = teamA.score - teamB.score;
      const scoreDeltaB = -scoreDeltaA;

      const allOpponents = [...teamA.playerIds, ...teamB.playerIds];
      const avgOpponentLevel = allOpponents
        .map(id => players.find(p => p.userId === id)?.level || 1)
        .reduce((sum, level) => sum + level, 0) / allOpponents.length;

      for (const playerId of teamA.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateAmericanoRating(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability + playerTotalChanges[playerId].reliabilityChange,
            gamesPlayed: player.gamesPlayed,
          },
          scoreDeltaA,
          avgOpponentLevel
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].reliabilityChange += update.reliabilityChange;
        playerTotalChanges[playerId].pointsEarned += update.pointsEarned;
        playerTotalChanges[playerId].totalScore += teamA.score;
      }

      for (const playerId of teamB.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateAmericanoRating(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability + playerTotalChanges[playerId].reliabilityChange,
            gamesPlayed: player.gamesPlayed,
          },
          scoreDeltaB,
          avgOpponentLevel
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].reliabilityChange += update.reliabilityChange;
        playerTotalChanges[playerId].pointsEarned += update.pointsEarned;
        playerTotalChanges[playerId].totalScore += teamB.score;
      }
    }

    roundOutcomes[roundIndex] = Object.entries(roundPlayerOutcomes).map(([userId, levelChange]) => ({
      userId,
      levelChange,
    }));
  });

  const sortedPlayers = players
    .map(p => ({
      ...p,
      totalChange: playerTotalChanges[p.userId].levelChange,
      totalScore: playerTotalChanges[p.userId].totalScore,
    }))
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.totalChange - a.totalChange;
    });

  const gameOutcomes: GameOutcomeResult[] = sortedPlayers.map((player, index) => ({
    userId: player.userId,
    levelChange: playerTotalChanges[player.userId].levelChange,
    reliabilityChange: playerTotalChanges[player.userId].reliabilityChange,
    pointsEarned: playerTotalChanges[player.userId].pointsEarned,
    isWinner: index === 0,
    position: index + 1,
  }));

  return { gameOutcomes, roundOutcomes };
}

