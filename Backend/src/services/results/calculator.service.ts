import { calculateRatingUpdate, RELIABILITY_INCREMENT } from './rating.service';

interface PlayerData {
  userId: string;
  level: number;
  reliability: number;
  gamesPlayed: number;
}

interface TeamScore {
  teamId: string;
  teamNumber: number;
  score: number;
  playerIds: string[];
}

interface SetScore {
  teamAScore: number;
  teamBScore: number;
}

interface MatchResultData {
  teams: TeamScore[];
  winnerId?: string | null;
  sets?: SetScore[];
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
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
}

export interface RoundOutcomeResult {
  userId: string;
  levelChange: number;
}

interface PlayerChanges {
  levelChange: number;
  matchesPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  totalScore?: number;
}

function initializePlayerChanges(players: PlayerData[], includeTotal: boolean = false): Record<string, PlayerChanges> {
  const changes: Record<string, PlayerChanges> = {};
  for (const player of players) {
    changes[player.userId] = {
      levelChange: 0,
      matchesPlayed: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      scoresMade: 0,
      scoresLost: 0,
    };
    if (includeTotal) {
      changes[player.userId].totalScore = 0;
    }
  }
  return changes;
}

function updateWinLossTie(
  playerChanges: PlayerChanges,
  isWin: boolean,
  isLoss: boolean,
  isTie: boolean
): void {
  if (isWin) {
    playerChanges.wins++;
  } else if (isLoss) {
    playerChanges.losses++;
  } else if (isTie) {
    playerChanges.ties++;
  }
}

function calculatePointsEarned(
  changes: PlayerChanges,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number
): number {
  return changes.wins * pointsPerWin + changes.ties * pointsPerTie + changes.losses * pointsPerLoose;
}

function buildGameOutcome(
  userId: string,
  changes: PlayerChanges,
  index: number,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number
): GameOutcomeResult {
  return {
    userId,
    levelChange: changes.levelChange,
    reliabilityChange: changes.matchesPlayed * RELIABILITY_INCREMENT,
    pointsEarned: calculatePointsEarned(changes, pointsPerWin, pointsPerTie, pointsPerLoose),
    isWinner: index === 0,
    position: index + 1,
    wins: changes.wins,
    ties: changes.ties,
    losses: changes.losses,
    scoresMade: changes.scoresMade,
    scoresLost: changes.scoresLost,
  };
}

export function calculateByMatchesWonOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[],
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0,
  ballsInGames: boolean = false
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const roundOutcomes: Record<number, RoundOutcomeResult[]> = {};
  const playerTotalChanges = initializePlayerChanges(players);

  roundResults.forEach((roundResult, roundIndex) => {
    const roundPlayerOutcomes: Record<string, number> = {};

    for (const player of players) {
      roundPlayerOutcomes[player.userId] = 0;
    }

    for (const match of roundResult.matches) {
      if (match.teams.length !== 2) continue;

      const validSets = match.sets?.filter(set => set.teamAScore > 0 || set.teamBScore > 0) || [];
      if (validSets.length === 0) continue;

      const teamA = match.teams.find(t => t.teamNumber === 1) || match.teams[0];
      const teamB = match.teams.find(t => t.teamNumber === 2) || match.teams[1];
      const teamAWins = match.winnerId === teamA.teamId;
      const teamBWins = match.winnerId === teamB.teamId;
      const isTie = !teamAWins && !teamBWins;
      const teamAScore = validSets.reduce((sum, set) => sum + set.teamAScore, 0) || teamA.score || 0;
      const teamBScore = validSets.reduce((sum, set) => sum + set.teamBScore, 0) || teamB.score || 0;

      const teamAPlayers = players.filter(p => teamA.playerIds.includes(p.userId));
      const teamBPlayers = players.filter(p => teamB.playerIds.includes(p.userId));

      const teamAAvgLevel = teamAPlayers.reduce((sum, p) => sum + p.level, 0) / teamAPlayers.length;
      const teamBAvgLevel = teamBPlayers.reduce((sum, p) => sum + p.level, 0) / teamBPlayers.length;

      for (const player of teamAPlayers) {
        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[player.userId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamAWins,
            opponentsLevel: teamBAvgLevel,
            setScores: validSets,
          },
          ballsInGames
        );

        roundPlayerOutcomes[player.userId] += update.levelChange;
        playerTotalChanges[player.userId].levelChange += update.levelChange;
        playerTotalChanges[player.userId].matchesPlayed += 1;
        playerTotalChanges[player.userId].scoresMade += teamAScore;
        playerTotalChanges[player.userId].scoresLost += teamBScore;
        updateWinLossTie(playerTotalChanges[player.userId], teamAWins, teamBWins, isTie);
      }

      for (const player of teamBPlayers) {
        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[player.userId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamBWins,
            opponentsLevel: teamAAvgLevel,
            setScores: validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore })),
          },
          ballsInGames
        );

        roundPlayerOutcomes[player.userId] += update.levelChange;
        playerTotalChanges[player.userId].levelChange += update.levelChange;
        playerTotalChanges[player.userId].matchesPlayed += 1;
        playerTotalChanges[player.userId].scoresMade += teamBScore;
        playerTotalChanges[player.userId].scoresLost += teamAScore;
        updateWinLossTie(playerTotalChanges[player.userId], teamBWins, teamAWins, isTie);
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
      matchesWon: playerTotalChanges[p.userId].wins,
      scoresDelta: playerTotalChanges[p.userId].scoresMade - playerTotalChanges[p.userId].scoresLost,
    }))
    .sort((a, b) => {
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      return b.scoresDelta - a.scoresDelta;
    });

  const gameOutcomes: GameOutcomeResult[] = sortedPlayers.map((player, index) => 
    buildGameOutcome(player.userId, playerTotalChanges[player.userId], index, pointsPerWin, pointsPerTie, pointsPerLoose)
  );

  return { gameOutcomes, roundOutcomes };
}

export function calculateByPointsOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[],
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0,
  ballsInGames: boolean = false
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const roundOutcomes: Record<number, RoundOutcomeResult[]> = {};
  const playerTotalChanges = initializePlayerChanges(players, true);

  roundResults.forEach((roundResult, roundIndex) => {
    const roundPlayerOutcomes: Record<string, number> = {};

    for (const player of players) {
      roundPlayerOutcomes[player.userId] = 0;
    }

    for (const match of roundResult.matches) {
      if (match.teams.length !== 2) continue;

      const validSets = match.sets?.filter(set => set.teamAScore > 0 || set.teamBScore > 0) || [];
      if (validSets.length === 0) continue;

      const [teamA, teamB] = match.teams;
      const teamAWins = match.winnerId === teamA.teamId;
      const teamBWins = match.winnerId === teamB.teamId;
      const isTie = !teamAWins && !teamBWins;

      const teamBAvgLevel = teamB.playerIds
        .map(id => {
          const player = players.find(p => p.userId === id);
          return player ? player.level : 1;
        })
        .reduce((sum, level) => sum + level, 0) / teamB.playerIds.length;
      const teamAAvgLevel = teamA.playerIds
        .map(id => {
          const player = players.find(p => p.userId === id);
          return player ? player.level : 1;
        })
        .reduce((sum, level) => sum + level, 0) / teamA.playerIds.length;

      for (const playerId of teamA.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamAWins,
            opponentsLevel: teamBAvgLevel,
            setScores: validSets,
          },
          ballsInGames
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].totalScore! += teamA.score;
        playerTotalChanges[playerId].scoresMade += teamA.score;
        playerTotalChanges[playerId].scoresLost += teamB.score;
        updateWinLossTie(playerTotalChanges[playerId], teamAWins, teamBWins, isTie);
      }

      for (const playerId of teamB.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamBWins,
            opponentsLevel: teamAAvgLevel,
            setScores: validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore })),
          },
          ballsInGames
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].totalScore! += teamB.score;
        playerTotalChanges[playerId].scoresMade += teamB.score;
        playerTotalChanges[playerId].scoresLost += teamA.score;
        updateWinLossTie(playerTotalChanges[playerId], teamBWins, teamAWins, isTie);
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
      pointsEarned: calculatePointsEarned(playerTotalChanges[p.userId], pointsPerWin, pointsPerTie, pointsPerLoose),
      scoresDelta: playerTotalChanges[p.userId].scoresMade - playerTotalChanges[p.userId].scoresLost,
    }))
    .sort((a, b) => {
      const pointsDiff = b.pointsEarned - a.pointsEarned;
      if (pointsDiff !== 0) return pointsDiff;
      return b.scoresDelta - a.scoresDelta;
    });

  const gameOutcomes: GameOutcomeResult[] = sortedPlayers.map((player, index) =>
    buildGameOutcome(player.userId, playerTotalChanges[player.userId], index, pointsPerWin, pointsPerTie, pointsPerLoose)
  );

  return { gameOutcomes, roundOutcomes };
}

export function calculateByScoresDeltaOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[],
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0,
  ballsInGames: boolean = false
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const roundOutcomes: Record<number, RoundOutcomeResult[]> = {};
  const playerTotalChanges = initializePlayerChanges(players, true);

  roundResults.forEach((roundResult, roundIndex) => {
    const roundPlayerOutcomes: Record<string, number> = {};

    for (const player of players) {
      roundPlayerOutcomes[player.userId] = 0;
    }

    for (const match of roundResult.matches) {
      if (match.teams.length !== 2) continue;

      const validSets = match.sets?.filter(set => set.teamAScore > 0 || set.teamBScore > 0) || [];
      if (validSets.length === 0) continue;

      const [teamA, teamB] = match.teams;
      const teamAWins = match.winnerId === teamA.teamId;
      const teamBWins = match.winnerId === teamB.teamId;
      const isTie = !teamAWins && !teamBWins;

      const teamBAvgLevel = teamB.playerIds
        .map(id => {
          const player = players.find(p => p.userId === id);
          return player ? player.level : 1;
        })
        .reduce((sum, level) => sum + level, 0) / teamB.playerIds.length;
      const teamAAvgLevel = teamA.playerIds
        .map(id => {
          const player = players.find(p => p.userId === id);
          return player ? player.level : 1;
        })
        .reduce((sum, level) => sum + level, 0) / teamA.playerIds.length;

      for (const playerId of teamA.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamAWins,
            opponentsLevel: teamBAvgLevel,
            setScores: validSets,
          },
          ballsInGames
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].totalScore! += teamA.score;
        playerTotalChanges[playerId].scoresMade += teamA.score;
        playerTotalChanges[playerId].scoresLost += teamB.score;
        updateWinLossTie(playerTotalChanges[playerId], teamAWins, teamBWins, isTie);
      }

      for (const playerId of teamB.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
          },
          {
            isWinner: teamBWins,
            opponentsLevel: teamAAvgLevel,
            setScores: validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore })),
          },
          ballsInGames
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].totalScore! += teamB.score;
        playerTotalChanges[playerId].scoresMade += teamB.score;
        playerTotalChanges[playerId].scoresLost += teamA.score;
        updateWinLossTie(playerTotalChanges[playerId], teamBWins, teamAWins, isTie);
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
      matchesWon: playerTotalChanges[p.userId].wins,
      scoresDelta: playerTotalChanges[p.userId].scoresMade - playerTotalChanges[p.userId].scoresLost,
    }))
    .sort((a, b) => {
      const deltasDiff = b.scoresDelta - a.scoresDelta;
      if (deltasDiff !== 0) return deltasDiff;
      return b.matchesWon - a.matchesWon;
    });

  const gameOutcomes: GameOutcomeResult[] = sortedPlayers.map((player, index) =>
    buildGameOutcome(player.userId, playerTotalChanges[player.userId], index, pointsPerWin, pointsPerTie, pointsPerLoose)
  );

  return { gameOutcomes, roundOutcomes };
}

