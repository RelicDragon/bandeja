import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { WinnerOfGame, ParticipantLevelUpMode, Prisma } from '@prisma/client';
import { calculateByMatchesWonOutcomes, calculateByScoresDeltaOutcomes, calculateByPointsOutcomes, calculateBySetsWonOutcomes, calculateCombinedOutcomes } from './calculator.service';
import { updateGameOutcomes } from './gameWinner.service';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';

export async function generateGameOutcomes(gameId: string, tx?: Prisma.TransactionClient) {
  const prismaClient = tx || prisma;
  const game = await prismaClient.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        include: {
          user: true,
        },
        where: {
          isPlaying: true,
        },
      },
      rounds: {
        include: {
          matches: {
            include: {
              teams: {
                include: {
                  players: true,
                },
              },
              sets: true,
            },
          },
        },
        orderBy: {
          roundNumber: 'asc',
        },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const players = game.participants.map(p => ({
    userId: p.userId,
    level: p.user.level,
    reliability: p.user.reliability,
    gamesPlayed: p.user.gamesPlayed,
  }));

  const roundResults = game.rounds.map(round => ({
    matches: round.matches
      .map(match => {
        const validSets = match.sets.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
        if (validSets.length === 0) return null;
        
        const teams = match.teams.map(team => {
          const totalScore = validSets.reduce((sum, set) => {
            if (team.teamNumber === 1) return sum + set.teamAScore;
            if (team.teamNumber === 2) return sum + set.teamBScore;
            return sum;
          }, 0);

          return {
            teamId: team.id,
            teamNumber: team.teamNumber,
            score: totalScore,
            playerIds: team.players.map(p => p.userId),
          };
        });

        const sets = validSets.map(set => ({
          teamAScore: set.teamAScore,
          teamBScore: set.teamBScore,
        }));

        return {
          teams,
          winnerId: match.winnerId,
          sets,
        };
      })
      .filter((match): match is NonNullable<typeof match> => match !== null),
  }));

  let result;
  const participantLevelUpMode = game.participantLevelUpMode || ParticipantLevelUpMode.BY_MATCHES;
  const ballsInGames = game.ballsInGames || false;
  
  if (game.winnerOfGame === WinnerOfGame.BY_SCORES_DELTA) {
    result = calculateByScoresDeltaOutcomes(
      players, 
      roundResults,
      game.pointsPerWin || 0,
      game.pointsPerTie || 0,
      game.pointsPerLoose || 0,
      ballsInGames
    );
  } else if (game.winnerOfGame === WinnerOfGame.BY_POINTS) {
    result = calculateByPointsOutcomes(
      players, 
      roundResults,
      game.pointsPerWin || 0,
      game.pointsPerTie || 0,
      game.pointsPerLoose || 0,
      ballsInGames
    );
  } else {
    if (participantLevelUpMode === ParticipantLevelUpMode.BY_SETS) {
      result = calculateBySetsWonOutcomes(
        players, 
        roundResults,
        game.pointsPerWin || 0,
        game.pointsPerTie || 0,
        game.pointsPerLoose || 0,
        ballsInGames
      );
    } else if (participantLevelUpMode === ParticipantLevelUpMode.COMBINED) {
      result = calculateCombinedOutcomes(
      players, 
      roundResults,
      game.pointsPerWin || 0,
      game.pointsPerTie || 0,
      game.pointsPerLoose || 0,
      ballsInGames
    );
  } else {
    result = calculateByMatchesWonOutcomes(
      players, 
      roundResults,
      game.pointsPerWin || 0,
      game.pointsPerTie || 0,
      game.pointsPerLoose || 0,
      ballsInGames
    );
    }
  }

  return {
    finalOutcomes: result.gameOutcomes,
    roundOutcomes: result.roundOutcomes,
  };
}

export async function undoGameOutcomes(gameId: string, tx: Prisma.TransactionClient) {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
      outcomes: true,
    },
  });

  if (!game || !game.affectsRating || game.outcomes.length === 0) {
    return;
  }

  const { LeagueGameResultsService } = await import('../league/gameResults.service');
  await LeagueGameResultsService.unsyncGameResults(gameId, tx);

  for (const outcome of game.outcomes) {
    await tx.user.update({
      where: { id: outcome.userId },
      data: {
        level: outcome.levelBefore,
        reliability: outcome.reliabilityBefore,
        totalPoints: { decrement: outcome.pointsEarned },
        gamesPlayed: { decrement: 1 },
        gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
      },
    });
  }

  await tx.gameOutcome.deleteMany({
    where: { gameId },
  });

}

export async function applyGameOutcomes(
  gameId: string,
  finalOutcomes: Array<{
    userId: string;
    levelChange: number;
    reliabilityChange: number;
    pointsEarned: number;
    position?: number;
    isWinner?: boolean;
    wins?: number;
    ties?: number;
    losses?: number;
    scoresMade?: number;
    scoresLost?: number;
  }>,
  roundOutcomes: Record<number, Array<{
    userId: string;
    levelChange: number;
  }>>,
  tx: Prisma.TransactionClient
): Promise<{ wasEdited: boolean }> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
      rounds: {
        orderBy: { roundNumber: 'asc' },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  console.log(`[APPLY GAME OUTCOMES] Updating game outcomes (position, isWinner) for game ${gameId}`);
  await updateGameOutcomes(gameId, game.winnerOfGame, tx);

  console.log(`[APPLY GAME OUTCOMES] Applying level/reliability changes and updating player stats for game ${gameId}`);
  for (const outcome of finalOutcomes) {
    const user = await tx.user.findUnique({
      where: { id: outcome.userId },
    });

    if (!user) continue;

    const levelBefore = user.level;
    const reliabilityBefore = user.reliability;
    const levelAfter = levelBefore + outcome.levelChange;
    const reliabilityAfter = reliabilityBefore + outcome.reliabilityChange;

    await tx.gameOutcome.upsert({
      where: {
        gameId_userId: {
          gameId,
          userId: outcome.userId,
        },
      },
      create: {
        gameId,
        userId: outcome.userId,
        levelBefore,
        levelAfter,
        levelChange: outcome.levelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: outcome.reliabilityChange,
        pointsEarned: outcome.pointsEarned,
        position: outcome.position,
        isWinner: outcome.isWinner || false,
        wins: outcome.wins || 0,
        ties: outcome.ties || 0,
        losses: outcome.losses || 0,
        scoresMade: outcome.scoresMade || 0,
        scoresLost: outcome.scoresLost || 0,
      },
      update: {
        levelBefore,
        levelAfter,
        levelChange: outcome.levelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: outcome.reliabilityChange,
        pointsEarned: outcome.pointsEarned,
        wins: outcome.wins || 0,
        ties: outcome.ties || 0,
        losses: outcome.losses || 0,
        scoresMade: outcome.scoresMade || 0,
        scoresLost: outcome.scoresLost || 0,
      },
    });

    if (game.affectsRating) {
      await tx.user.update({
        where: { id: outcome.userId },
        data: {
          level: levelAfter,
          reliability: reliabilityAfter,
          totalPoints: { increment: outcome.pointsEarned },
          gamesPlayed: { increment: 1 },
          gamesWon: outcome.isWinner ? { increment: 1 } : undefined,
        },
      });
    }
  }

  const updatedGame = await tx.game.findUnique({
    where: { id: gameId },
    select: { startTime: true, endTime: true, resultsStatus: true },
  });

  if (updatedGame) {
    const { calculateGameStatus } = await import('../../utils/gameStatus');
    const previousResultsStatus = updatedGame.resultsStatus;
    
    await tx.game.update({
      where: { id: gameId },
      data: {
        resultsStatus: 'FINAL',
        status: calculateGameStatus({
          startTime: updatedGame.startTime,
          endTime: updatedGame.endTime,
          resultsStatus: 'FINAL',
        }),
      },
    });

    if (previousResultsStatus !== 'FINAL' && game.affectsRating) {
      for (const outcome of finalOutcomes) {
        const gameOutcome = await tx.gameOutcome.findUnique({
          where: {
            gameId_userId: {
              gameId,
              userId: outcome.userId,
            },
          },
        });

        if (gameOutcome && gameOutcome.levelChange !== 0) {
          await tx.levelChangeEvent.create({
            data: {
              userId: outcome.userId,
              levelBefore: gameOutcome.levelBefore,
              levelAfter: gameOutcome.levelAfter,
              eventType: 'GAME',
              linkEntityType: 'GAME',
              gameId: gameId,
            },
          });
        }
      }
    }

    const { LeagueGameResultsService } = await import('../league/gameResults.service');
    await LeagueGameResultsService.syncGameResults(gameId, tx);
    
    const isEdited = previousResultsStatus === 'FINAL' || previousResultsStatus === 'IN_PROGRESS';
    return { wasEdited: isEdited };
  }
  
  return { wasEdited: false };
}

export async function recalculateGameOutcomes(gameId: string, requestUserId: string) {
  console.log(`[RECALCULATE GAME OUTCOMES] Starting recalculation for game ${gameId} by user ${requestUserId}`);
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
    },
  });

  if (!game) {
    console.log(`[RECALCULATE GAME OUTCOMES] Game ${gameId} not found`);
    throw new ApiError(404, 'Game not found');
  }

  const hasPermission = await hasParentGamePermission(gameId, requestUserId);

  if (!hasPermission && !game.resultsByAnyone) {
    console.log(`[RECALCULATE GAME OUTCOMES] User ${requestUserId} not authorized to recalculate outcomes for game ${gameId}`);
    throw new ApiError(403, 'Only game owners/admins can recalculate outcomes');
  }

  console.log(`[RECALCULATE GAME OUTCOMES] Game ${gameId} configuration: winnerOfMatch=${game.winnerOfMatch}, winnerOfGame=${game.winnerOfGame}`);

  let wasEdited = false;
  
  const result = await prisma.$transaction(async (tx) => {
    console.log(`[RECALCULATE GAME OUTCOMES] Step 1: Undoing existing outcomes`);
    await undoGameOutcomes(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 2: Updating match winners based on set scores`);
    const { updateMatchWinners } = await import('./matchWinner.service');
    await updateMatchWinners(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 3: Generating new outcomes`);
    const outcomeData = await generateGameOutcomes(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 4: Applying outcomes (${outcomeData.finalOutcomes.length} final outcomes, ${Object.keys(outcomeData.roundOutcomes).length} rounds)`);
    const applyResult = await applyGameOutcomes(
      gameId,
      outcomeData.finalOutcomes,
      outcomeData.roundOutcomes,
      tx
    );
    
    wasEdited = applyResult.wasEdited;

    return await tx.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
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
                            avatar: true,
                            level: true,
                            socialLevel: true,
                          },
                        },
                      },
                    },
                  },
                },
                sets: true,
              },
            },
            outcomes: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    level: true,
                  },
                },
              },
            },
          },
          orderBy: { roundNumber: 'asc' },
        },
        outcomes: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                socialLevel: true,
                reliability: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
  });
  
  console.log(`[RECALCULATE GAME OUTCOMES] Transaction completed, wasEdited: ${wasEdited}`);
  console.log(`[TELEGRAM NOTIFICATION] Preparing to send notifications for game ${gameId}`);
  
  setImmediate(async () => {
    const telegramResultsSenderService = await import('../telegram/resultsSender.service');
    console.log(`[TELEGRAM NOTIFICATION] Calling sendGameFinished for game ${gameId}, isEdited: ${wasEdited}`);
    telegramResultsSenderService.default.sendGameFinished(gameId, wasEdited).catch((error: any) => {
      console.error(`Failed to send game finished notifications for game ${gameId}:`, error);
    });
  });
  
  return result;
}

