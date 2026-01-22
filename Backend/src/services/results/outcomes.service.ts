import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { WinnerOfGame, Prisma, EntityType } from '@prisma/client';
import { calculateByMatchesWonOutcomes, calculateByScoresDeltaOutcomes, calculateByPointsOutcomes } from './calculator.service';
import { updateGameOutcomes } from './gameWinner.service';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export async function generateGameOutcomes(gameId: string, tx?: Prisma.TransactionClient) {
  const prismaClient = tx || prisma;
  const game = await prismaClient.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        include: {
          user: {
            select: {
              ...USER_SELECT_FIELDS,
              reliability: true,
              gamesPlayed: true,
            },
          },
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
          isTieBreak: set.isTieBreak || false,
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
    result = calculateByMatchesWonOutcomes(
      players, 
      roundResults,
      game.pointsPerWin || 0,
      game.pointsPerTie || 0,
      game.pointsPerLoose || 0,
      ballsInGames
    );
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

  const { SocialParticipantLevelService } = await import('../socialParticipantLevel.service');
  await SocialParticipantLevelService.revertSocialParticipantLevelChanges(gameId, tx);

  for (const outcome of game.outcomes) {
    await tx.user.update({
      where: { id: outcome.userId },
      data: {
        level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
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
): Promise<{ wasEdited: boolean; shouldResolveBets: boolean }> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      entityType: true,
      affectsRating: true,
      winnerOfGame: true,
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
    const levelAfter = Math.max(1.0, Math.min(7.0, levelBefore + outcome.levelChange));
    const reliabilityAfter = Math.max(0.0, Math.min(100.0, reliabilityBefore + outcome.reliabilityChange));
    const actualLevelChange = levelAfter - levelBefore;
    const actualReliabilityChange = reliabilityAfter - reliabilityBefore;

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
        levelChange: actualLevelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: actualReliabilityChange,
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
        levelChange: actualLevelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: actualReliabilityChange,
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
    select: { startTime: true, endTime: true, resultsStatus: true, cityId: true, timeIsSet: true, entityType: true, finishedDate: true },
  });

  if (updatedGame) {
    const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
    const { calculateGameStatus, isResultsBasedEntityType } = await import('../../utils/gameStatus');
    const previousResultsStatus = updatedGame.resultsStatus;
    
    const isResultsBased = isResultsBasedEntityType(updatedGame.entityType);
    const isFirstTimeFinal = previousResultsStatus !== 'FINAL';
    
    const updateData: {
      resultsStatus: 'FINAL';
      status: 'FINISHED' | 'ANNOUNCED' | 'STARTED' | 'ARCHIVED';
      finishedDate?: Date;
    } = {
      resultsStatus: 'FINAL',
      status: 'FINISHED',
    };
    
    if (isResultsBased && isFirstTimeFinal) {
      updateData.finishedDate = new Date();
    } else if (!isResultsBased) {
      updateData.status = calculateGameStatus({
        startTime: updatedGame.startTime,
        endTime: updatedGame.endTime,
        resultsStatus: 'FINAL',
        timeIsSet: updatedGame.timeIsSet,
        finishedDate: updatedGame.finishedDate,
        entityType: updatedGame.entityType,
      }, cityTimezone);
    }
    
    await tx.game.update({
      where: { id: gameId },
      data: updateData,
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

    if (previousResultsStatus !== 'FINAL' && game.entityType !== EntityType.BAR && game.entityType !== EntityType.LEAGUE_SEASON) {
      const { SocialParticipantLevelService } = await import('../socialParticipantLevel.service');
      await SocialParticipantLevelService.applySocialParticipantLevelChanges(gameId, tx);
    }
    
    return { wasEdited: previousResultsStatus === 'FINAL' || previousResultsStatus === 'IN_PROGRESS', shouldResolveBets: previousResultsStatus !== 'FINAL' };
  }
  
  return { wasEdited: false, shouldResolveBets: false };
}

export async function recalculateGameOutcomes(gameId: string) {
  console.log(`[RECALCULATE GAME OUTCOMES] Starting recalculation for game ${gameId}`);
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
    const shouldResolveBets = applyResult.shouldResolveBets;

    const game = await tx.game.findUnique({
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
                          select: USER_SELECT_FIELDS,
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
                  select: USER_SELECT_FIELDS,
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
                ...USER_SELECT_FIELDS,
                reliability: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    
    return { game, shouldResolveBets };
  });
  
  console.log(`[RECALCULATE GAME OUTCOMES] Transaction completed, wasEdited: ${wasEdited}`);
  
  if (result.shouldResolveBets) {
    console.log(`[BET RESOLUTION] Triggering bet resolution for game ${gameId} (results finalizing)`);
    try {
      const { resolveGameBets } = await import('../bets/betResolution.service');
      await resolveGameBets(gameId);
      console.log(`[BET RESOLUTION] Bet resolution completed for game ${gameId}`);
    } catch (error) {
      console.error(`[BET RESOLUTION] Failed to resolve bets for game ${gameId}:`, error);
    }
  }
  
  console.log(`[TELEGRAM NOTIFICATION] Preparing to send notifications for game ${gameId}`);
  
  setImmediate(async () => {
    const telegramResultsSenderService = await import('../telegram/resultsSender.service');
    console.log(`[TELEGRAM NOTIFICATION] Calling sendGameFinished for game ${gameId}, isEdited: ${wasEdited}`);
    telegramResultsSenderService.default.sendGameFinished(gameId, wasEdited).catch((error: any) => {
      console.error(`Failed to send game finished notifications for game ${gameId}:`, error);
    });
  });
  
  return result.game;
  
  return result;
}

