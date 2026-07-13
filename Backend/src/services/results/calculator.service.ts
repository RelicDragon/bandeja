import type { Sport } from '../../sport/sportIds';
import { Sports } from '../../sport/sportIds';
import { EntityType } from '@prisma/client';
import { getSportConfig } from '../../sport/sportRegistry';
import type { SportRatingModel } from '../../shared/createTemplates';
import { getMatchScoresForDelta } from './setScoreDelta';
import { calculateRatingUpdate, calculateReliabilityChange } from './rating.service';
import type { RatingSetScore } from '@bandeja/shared/automaticRelaxedScoring';

interface PlayerData {
  userId: string;
  level: number;
  reliability: number;
  gamesPlayed: number;
  ratingUncertainty: number;
}

interface TeamScore {
  teamId: string;
  teamNumber: number;
  score: number;
  playerIds: string[];
}

type SetScore = RatingSetScore;

interface MatchResultData {
  teams: TeamScore[];
  winnerId?: string | null;
  sets?: SetScore[];
  metadata?: Record<string, unknown> | null;
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
  setsPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  totalScore?: number;
  betterTeamButLost: number;
  allSets: Array<{ teamAScore: number; teamBScore: number; isTieBreak?: boolean }>;
}

function initializePlayerChanges(players: PlayerData[], includeTotal: boolean = false): Record<string, PlayerChanges> {
  const changes: Record<string, PlayerChanges> = {};
  for (const player of players) {
    changes[player.userId] = {
      levelChange: 0,
      matchesPlayed: 0,
      setsPlayed: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      scoresMade: 0,
      scoresLost: 0,
      betterTeamButLost: 0,
      allSets: [],
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

function teamAverageLevelAtMatchStart(
  playerIds: string[],
  players: PlayerData[],
  playerTotalChanges: Record<string, PlayerChanges>
): number {
  if (playerIds.length === 0) return 0;
  let sum = 0;
  for (const id of playerIds) {
    const p = players.find(x => x.userId === id);
    const baseLevel = p ? p.level : 1;
    sum += baseLevel + (playerTotalChanges[id]?.levelChange ?? 0);
  }
  return sum / playerIds.length;
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
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
  ballsInGames: boolean,
): GameOutcomeResult {
  const reliabilityChange = calculateReliabilityChange(changes.allSets, ballsInGames);

  return {
    userId,
    levelChange: changes.levelChange,
    reliabilityChange,
    pointsEarned: calculatePointsEarned(changes, pointsPerWin, pointsPerTie, pointsPerLoose),
    isWinner: false,
    wins: changes.wins,
    ties: changes.ties,
    losses: changes.losses,
    scoresMade: changes.scoresMade,
    scoresLost: changes.scoresLost,
  };
}

function ratingEngineForSport(sport: Sport): SportRatingModel['engine'] {
  return getSportConfig(sport).ratingModel.engine;
}

export function calculateByMatchesWonOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[],
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0,
  ballsInGames: boolean = false,
  sport: Sport = Sports.PADEL,
  entityType?: EntityType,
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const engine = ratingEngineForSport(sport);
  const ratingBallsInGames = ballsInGames && (engine.ballsInGamesMargin ?? false);
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
      const { teamAScore: scoreA, teamBScore: scoreB } = getMatchScoresForDelta(validSets);
      const teamAScore = scoreA || teamA.score || 0;
      const teamBScore = scoreB || teamB.score || 0;

      const teamAPlayers = players.filter(p => teamA.playerIds.includes(p.userId));
      const teamBPlayers = players.filter(p => teamB.playerIds.includes(p.userId));

      const teamAAvgLevel = teamAPlayers.reduce((sum, p) => sum + p.level, 0) / teamAPlayers.length;
      const teamBAvgLevel = teamBPlayers.reduce((sum, p) => sum + p.level, 0) / teamBPlayers.length;

      const teamAOwnAvgStart = teamAverageLevelAtMatchStart(teamA.playerIds, players, playerTotalChanges);
      const teamBOwnAvgStart = teamAverageLevelAtMatchStart(teamB.playerIds, players, playerTotalChanges);

      for (const player of teamAPlayers) {
        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[player.userId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
            ratingUncertainty: player.ratingUncertainty,
          },
          {
            isWinner: teamAWins,
            isDraw: isTie,
            ownTeamLevel: teamAOwnAvgStart,
            opponentsLevel: teamBOwnAvgStart,
            setScores: validSets,
          },
          ratingBallsInGames,
          engine,
          entityType,
        );

        roundPlayerOutcomes[player.userId] += update.levelChange;
        playerTotalChanges[player.userId].levelChange += update.levelChange;
        playerTotalChanges[player.userId].matchesPlayed += 1;
        playerTotalChanges[player.userId].setsPlayed += validSets.length;
        playerTotalChanges[player.userId].scoresMade += teamAScore;
        playerTotalChanges[player.userId].scoresLost += teamBScore;
        playerTotalChanges[player.userId].allSets.push(...validSets);
        updateWinLossTie(playerTotalChanges[player.userId], teamAWins, teamBWins, isTie);
        
        if (teamAAvgLevel > teamBAvgLevel && teamBWins) {
          playerTotalChanges[player.userId].betterTeamButLost += 1;
        }
      }

      for (const player of teamBPlayers) {
        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[player.userId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
            ratingUncertainty: player.ratingUncertainty,
          },
          {
            isWinner: teamBWins,
            isDraw: isTie,
            ownTeamLevel: teamBOwnAvgStart,
            opponentsLevel: teamAOwnAvgStart,
            setScores: validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore, isTieBreak: s.isTieBreak })),
          },
          ratingBallsInGames,
          engine,
          entityType,
        );

        roundPlayerOutcomes[player.userId] += update.levelChange;
        playerTotalChanges[player.userId].levelChange += update.levelChange;
        playerTotalChanges[player.userId].matchesPlayed += 1;
        playerTotalChanges[player.userId].setsPlayed += validSets.length;
        playerTotalChanges[player.userId].scoresMade += teamBScore;
        playerTotalChanges[player.userId].scoresLost += teamAScore;
        playerTotalChanges[player.userId].allSets.push(...validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore, isTieBreak: s.isTieBreak })));
        updateWinLossTie(playerTotalChanges[player.userId], teamBWins, teamAWins, isTie);
        
        if (teamBAvgLevel > teamAAvgLevel && teamAWins) {
          playerTotalChanges[player.userId].betterTeamButLost += 1;
        }
      }
    }

    roundOutcomes[roundIndex] = Object.entries(roundPlayerOutcomes).map(([userId, levelChange]) => ({
      userId,
      levelChange,
    }));
  });

  const gameOutcomes: GameOutcomeResult[] = players.map((player) =>
    buildGameOutcome(
      player.userId,
      playerTotalChanges[player.userId],
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      ratingBallsInGames,
    ),
  );

  return { gameOutcomes, roundOutcomes };
}

export function calculateByPointsOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[],
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0,
  ballsInGames: boolean = false,
  sport: Sport = Sports.PADEL,
  entityType?: EntityType,
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const engine = ratingEngineForSport(sport);
  const ratingBallsInGames = ballsInGames && (engine.ballsInGamesMargin ?? false);
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

      const teamAOwnAvgStart = teamAverageLevelAtMatchStart(teamA.playerIds, players, playerTotalChanges);
      const teamBOwnAvgStart = teamAverageLevelAtMatchStart(teamB.playerIds, players, playerTotalChanges);

      for (const playerId of teamA.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
            ratingUncertainty: player.ratingUncertainty,
          },
          {
            isWinner: teamAWins,
            isDraw: isTie,
            ownTeamLevel: teamAOwnAvgStart,
            opponentsLevel: teamBOwnAvgStart,
            setScores: validSets,
          },
          ratingBallsInGames,
          engine,
          entityType,
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].setsPlayed += validSets.length;
        playerTotalChanges[playerId].totalScore! += teamA.score;
        playerTotalChanges[playerId].scoresMade += teamA.score;
        playerTotalChanges[playerId].scoresLost += teamB.score;
        updateWinLossTie(playerTotalChanges[playerId], teamAWins, teamBWins, isTie);
        
        if (teamAAvgLevel > teamBAvgLevel && teamBWins) {
          playerTotalChanges[playerId].betterTeamButLost += 1;
        }
      }

      for (const playerId of teamB.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
            ratingUncertainty: player.ratingUncertainty,
          },
          {
            isWinner: teamBWins,
            isDraw: isTie,
            ownTeamLevel: teamBOwnAvgStart,
            opponentsLevel: teamAOwnAvgStart,
            setScores: validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore, isTieBreak: s.isTieBreak })),
          },
          ratingBallsInGames,
          engine,
          entityType,
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].setsPlayed += validSets.length;
        playerTotalChanges[playerId].totalScore! += teamB.score;
        playerTotalChanges[playerId].scoresMade += teamB.score;
        playerTotalChanges[playerId].scoresLost += teamA.score;
        updateWinLossTie(playerTotalChanges[playerId], teamBWins, teamAWins, isTie);
        
        if (teamBAvgLevel > teamAAvgLevel && teamAWins) {
          playerTotalChanges[playerId].betterTeamButLost += 1;
        }
      }
    }

    roundOutcomes[roundIndex] = Object.entries(roundPlayerOutcomes).map(([userId, levelChange]) => ({
      userId,
      levelChange,
    }));
  });

  const gameOutcomes: GameOutcomeResult[] = players.map((player) =>
    buildGameOutcome(
      player.userId,
      playerTotalChanges[player.userId],
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      ratingBallsInGames,
    ),
  );

  return { gameOutcomes, roundOutcomes };
}

export function calculateByScoresDeltaOutcomes(
  players: PlayerData[],
  roundResults: RoundResultData[],
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0,
  ballsInGames: boolean = false,
  sport: Sport = Sports.PADEL,
  entityType?: EntityType,
): {
  gameOutcomes: GameOutcomeResult[];
  roundOutcomes: Record<number, RoundOutcomeResult[]>;
} {
  const engine = ratingEngineForSport(sport);
  const ratingBallsInGames = ballsInGames && (engine.ballsInGamesMargin ?? false);
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

      const teamAOwnAvgStart = teamAverageLevelAtMatchStart(teamA.playerIds, players, playerTotalChanges);
      const teamBOwnAvgStart = teamAverageLevelAtMatchStart(teamB.playerIds, players, playerTotalChanges);

      for (const playerId of teamA.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
            ratingUncertainty: player.ratingUncertainty,
          },
          {
            isWinner: teamAWins,
            isDraw: isTie,
            ownTeamLevel: teamAOwnAvgStart,
            opponentsLevel: teamBOwnAvgStart,
            setScores: validSets,
          },
          ratingBallsInGames,
          engine,
          entityType,
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].setsPlayed += validSets.length;
        playerTotalChanges[playerId].totalScore! += teamA.score;
        playerTotalChanges[playerId].scoresMade += teamA.score;
        playerTotalChanges[playerId].scoresLost += teamB.score;
        playerTotalChanges[playerId].allSets.push(...validSets);
        updateWinLossTie(playerTotalChanges[playerId], teamAWins, teamBWins, isTie);
        
        if (teamAAvgLevel > teamBAvgLevel && teamBWins) {
          playerTotalChanges[playerId].betterTeamButLost += 1;
        }
      }

      for (const playerId of teamB.playerIds) {
        const player = players.find(p => p.userId === playerId);
        if (!player) continue;

        const update = calculateRatingUpdate(
          {
            level: player.level + playerTotalChanges[playerId].levelChange,
            reliability: player.reliability,
            gamesPlayed: player.gamesPlayed,
            ratingUncertainty: player.ratingUncertainty,
          },
          {
            isWinner: teamBWins,
            isDraw: isTie,
            ownTeamLevel: teamBOwnAvgStart,
            opponentsLevel: teamAOwnAvgStart,
            setScores: validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore, isTieBreak: s.isTieBreak })),
          },
          ratingBallsInGames,
          engine,
          entityType,
        );

        roundPlayerOutcomes[playerId] += update.levelChange;
        playerTotalChanges[playerId].levelChange += update.levelChange;
        playerTotalChanges[playerId].matchesPlayed += 1;
        playerTotalChanges[playerId].setsPlayed += validSets.length;
        playerTotalChanges[playerId].totalScore! += teamB.score;
        playerTotalChanges[playerId].scoresMade += teamB.score;
        playerTotalChanges[playerId].scoresLost += teamA.score;
        playerTotalChanges[playerId].allSets.push(...validSets.map(s => ({ teamAScore: s.teamBScore, teamBScore: s.teamAScore, isTieBreak: s.isTieBreak })));
        updateWinLossTie(playerTotalChanges[playerId], teamBWins, teamAWins, isTie);
        
        if (teamBAvgLevel > teamAAvgLevel && teamAWins) {
          playerTotalChanges[playerId].betterTeamButLost += 1;
        }
      }
    }

    roundOutcomes[roundIndex] = Object.entries(roundPlayerOutcomes).map(([userId, levelChange]) => ({
      userId,
      levelChange,
    }));
  });

  const gameOutcomes: GameOutcomeResult[] = players.map((player) =>
    buildGameOutcome(
      player.userId,
      playerTotalChanges[player.userId],
      pointsPerWin,
      pointsPerTie,
      pointsPerLoose,
      ratingBallsInGames,
    ),
  );

  return { gameOutcomes, roundOutcomes };
}

