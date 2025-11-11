import prisma from '../../config/database';
import { GameType, ParticipantLevelUpMode } from '@prisma/client';
import { calculateRatingUpdate, calculateAmericanoRating } from './rating.service';

interface ExplanationData {
  userId: string;
  userLevel: number;
  userReliability: number;
  userGamesPlayed: number;
  levelChange: number;
  reliabilityChange: number;
  matches: MatchExplanation[];
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    averageOpponentLevel: number;
  };
}

interface SetExplanation {
  setNumber: number;
  isWinner: boolean;
  levelChange: number;
}

interface MatchExplanation {
  matchNumber: number;
  roundNumber: number;
  isWinner: boolean;
  opponentLevel: number;
  levelDifference: number;
  scoreDelta?: number;
  levelChange: number;
  reliabilityChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
  teammates: Array<{ firstName: string | null; lastName: string | null; level: number }>;
  opponents: Array<{ firstName: string | null; lastName: string | null; level: number }>;
  sets?: SetExplanation[];
}

export async function getOutcomeExplanation(
  gameId: string,
  userId: string
): Promise<ExplanationData | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: {
          matches: {
            include: {
              teams: {
                include: {
                  players: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                          level: true,
                          reliability: true,
                          gamesPlayed: true,
                        },
                      },
                    },
                  },
                },
              },
              sets: true,
            },
          },
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              level: true,
              reliability: true,
              gamesPlayed: true,
            },
          },
        },
      },
      outcomes: {
        select: {
          userId: true,
          levelBefore: true,
        },
      },
    },
  });

  if (!game) return null;

  const participant = game.participants.find(p => p.userId === userId);
  if (!participant) return null;

  const participantLevelUpMode = game.participantLevelUpMode || ParticipantLevelUpMode.BY_MATCHES;

  const existingOutcome = await prisma.gameOutcome.findUnique({
    where: {
      gameId_userId: {
        gameId,
        userId,
      },
    },
  });

  // Create a map of userId to levelBefore for all players
  const playerLevelsMap = new Map<string, number>();
  if (game.outcomes && game.outcomes.length > 0) {
    // Use levelBefore from outcomes if they exist
    for (const outcome of game.outcomes) {
      playerLevelsMap.set(outcome.userId, outcome.levelBefore);
    }
  } else {
    // Fallback to current levels if no outcomes exist yet
    for (const p of game.participants) {
      playerLevelsMap.set(p.userId, p.user.level);
    }
  }

  const user = participant.user;
  let currentLevel = existingOutcome?.levelBefore ?? user.level;
  let currentReliability = existingOutcome?.reliabilityBefore ?? user.reliability;

  const matches: MatchExplanation[] = [];
  let totalLevelChange = 0;
  let totalReliabilityChange = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let opponentLevels: number[] = [];

  let matchNumber = 0;

  for (const round of game.rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
      if (validSets.length === 0) continue;

      const userTeam = match.teams.find(t => t.players.some(p => p.userId === userId));
      if (!userTeam) continue;

      matchNumber++;

      const opponentTeam = match.teams.find(t => t.id !== userTeam.id);
      if (!opponentTeam) continue;

      const teammates = userTeam.players
        .filter(p => p.userId !== userId)
        .map(p => ({
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          level: playerLevelsMap.get(p.userId) ?? p.user.level,
        }));

      const opponents = opponentTeam.players.map(p => ({
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        level: playerLevelsMap.get(p.userId) ?? p.user.level,
      }));

      const opponentLevel =
        opponentTeam.players.reduce((sum: number, p) => sum + (playerLevelsMap.get(p.userId) ?? p.user.level), 0) / opponentTeam.players.length;

      opponentLevels.push(opponentLevel);

      const levelDifference = opponentLevel - currentLevel;

      let isWinner = false;
      let scoreDelta: number | undefined = undefined;

      if (game.gameType === GameType.AMERICANO) {
        const userScore = userTeam.score;
        const opponentScore = opponentTeam.score;
        scoreDelta = userScore - opponentScore;

        const allOpponentLevels = [...userTeam.players, ...opponentTeam.players].map(p => playerLevelsMap.get(p.userId) ?? p.user.level);
        const avgOpponentLevel = allOpponentLevels.reduce((sum: number, l: number) => sum + l, 0) / allOpponentLevels.length;

        const update = calculateAmericanoRating(
          {
            level: currentLevel,
            reliability: currentReliability,
            gamesPlayed: user.gamesPlayed,
          },
          scoreDelta,
          avgOpponentLevel
        );

        currentLevel += update.levelChange;
        currentReliability += update.reliabilityChange;

        totalLevelChange += update.levelChange;
        totalReliabilityChange += update.reliabilityChange;

        if (scoreDelta > 0) wins++;
        else if (scoreDelta < 0) losses++;
        else draws++;

        matches.push({
          matchNumber,
          roundNumber: round.roundNumber,
          isWinner: scoreDelta > 0,
          opponentLevel,
          levelDifference,
          scoreDelta,
          levelChange: update.levelChange,
          reliabilityChange: update.reliabilityChange,
          pointsEarned: update.pointsEarned,
          teammates,
          opponents,
        });
      } else {
        const isTie = match.winnerId === null;
        isWinner = match.winnerId === userTeam.id;

        const setScores = validSets.map(set => {
          if (userTeam.teamNumber === 1) {
            return { teamAScore: set.teamAScore, teamBScore: set.teamBScore };
          } else {
            return { teamAScore: set.teamBScore, teamBScore: set.teamAScore };
          }
        });

        let matchLevelChange = 0;
        let matchReliabilityChange = 0;
        let matchPointsEarned = 0;
        let matchMultiplier: number | undefined = undefined;
        let matchTotalPointDifferential: number | undefined = undefined;
        const setExplanations: SetExplanation[] = [];

        if (participantLevelUpMode === ParticipantLevelUpMode.BY_SETS) {
          let setNumber = 0;
          for (const set of validSets) {
            setNumber++;
            const setAWins = set.teamAScore > set.teamBScore;
            const setBWins = set.teamBScore > set.teamAScore;
            const setIsWinner = userTeam.teamNumber === 1 ? setAWins : setBWins;

            const setUpdate = calculateRatingUpdate(
              {
                level: currentLevel,
                reliability: currentReliability,
                gamesPlayed: user.gamesPlayed,
              },
              {
                isWinner: setIsWinner,
                opponentsLevel: opponentLevel,
                setScores: [{
                  teamAScore: userTeam.teamNumber === 1 ? set.teamAScore : set.teamBScore,
                  teamBScore: userTeam.teamNumber === 1 ? set.teamBScore : set.teamAScore,
                }],
              }
            );

            const setLevelChange = setUpdate.levelChange * 0.33;
            matchLevelChange += setLevelChange;
            if (setNumber === 1) {
              matchReliabilityChange = setUpdate.reliabilityChange;
            }
            matchPointsEarned += setUpdate.pointsEarned;

            setExplanations.push({
              setNumber,
              isWinner: setIsWinner,
              levelChange: setLevelChange,
            });
          }
        } else if (participantLevelUpMode === ParticipantLevelUpMode.COMBINED) {
          const matchUpdate = calculateRatingUpdate(
            {
              level: currentLevel,
              reliability: currentReliability,
              gamesPlayed: user.gamesPlayed,
            },
            {
              isWinner,
              opponentsLevel: opponentLevel,
              setScores,
            }
          );

          let setNumber = 0;
          let setsLevelChange = 0;
          for (const set of validSets) {
            setNumber++;
            const setAWins = set.teamAScore > set.teamBScore;
            const setBWins = set.teamBScore > set.teamAScore;
            const setIsWinner = userTeam.teamNumber === 1 ? setAWins : setBWins;

            const setUpdate = calculateRatingUpdate(
              {
                level: currentLevel,
                reliability: currentReliability,
                gamesPlayed: user.gamesPlayed,
              },
              {
                isWinner: setIsWinner,
                opponentsLevel: opponentLevel,
                setScores: [{
                  teamAScore: userTeam.teamNumber === 1 ? set.teamAScore : set.teamBScore,
                  teamBScore: userTeam.teamNumber === 1 ? set.teamBScore : set.teamAScore,
                }],
              }
            );

            const setLevelChange = setUpdate.levelChange * 0.33;
            setsLevelChange += setLevelChange;

            setExplanations.push({
              setNumber,
              isWinner: setIsWinner,
              levelChange: setLevelChange,
            });
          }

          matchLevelChange = matchUpdate.levelChange * 0.5 + setsLevelChange * 0.5;
          matchReliabilityChange = matchUpdate.reliabilityChange * 0.5;
          matchPointsEarned = matchUpdate.pointsEarned;
          matchMultiplier = matchUpdate.multiplier;
          matchTotalPointDifferential = matchUpdate.totalPointDifferential;
        } else {
          const update = calculateRatingUpdate(
            {
              level: currentLevel,
              reliability: currentReliability,
              gamesPlayed: user.gamesPlayed,
            },
            {
              isWinner,
              opponentsLevel: opponentLevel,
              setScores,
            }
          );

          matchLevelChange = update.levelChange;
          matchReliabilityChange = update.reliabilityChange;
          matchPointsEarned = update.pointsEarned;
          matchMultiplier = update.multiplier;
          matchTotalPointDifferential = update.totalPointDifferential;
        }

        currentLevel += matchLevelChange;
        currentReliability += matchReliabilityChange;

        totalLevelChange += matchLevelChange;
        totalReliabilityChange += matchReliabilityChange;

        if (isTie) draws++;
        else if (isWinner) wins++;
        else losses++;

        matches.push({
          matchNumber,
          roundNumber: round.roundNumber,
          isWinner,
          opponentLevel,
          levelDifference,
          levelChange: matchLevelChange,
          reliabilityChange: matchReliabilityChange,
          pointsEarned: matchPointsEarned,
          multiplier: matchMultiplier,
          totalPointDifferential: matchTotalPointDifferential,
          teammates,
          opponents,
          sets: setExplanations.length > 0 ? setExplanations : undefined,
        });
      }
    }
  }

  const averageOpponentLevel =
    opponentLevels.length > 0 ? opponentLevels.reduce((sum: number, l: number) => sum + l, 0) / opponentLevels.length : 0;

  const startingLevel = existingOutcome?.levelBefore ?? user.level;
  const startingReliability = existingOutcome?.reliabilityBefore ?? user.reliability;

  return {
    userId,
    userLevel: startingLevel,
    userReliability: startingReliability,
    userGamesPlayed: user.gamesPlayed,
    levelChange: totalLevelChange,
    reliabilityChange: totalReliabilityChange,
    matches,
    summary: {
      totalMatches: matches.length,
      wins,
      losses,
      draws,
      averageOpponentLevel,
    },
  };
}

