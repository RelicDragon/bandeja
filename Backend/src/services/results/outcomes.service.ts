import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { GameType, Prisma } from '@prisma/client';
import { calculateClassicGameOutcomes, calculateAmericanoGameOutcomes } from './calculator.service';
import { updateMatchWinners } from './matchWinner.service';
import { updateRoundOutcomes } from './roundWinner.service';
import { updateGameOutcomes } from './gameWinner.service';

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
    matches: round.matches.map(match => {
      const teams = match.teams.map(team => {
        const totalScore = match.sets.reduce((sum, set) => {
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

      const sets = match.sets.map(set => ({
        teamAScore: set.teamAScore,
        teamBScore: set.teamBScore,
      }));

      return {
        teams,
        winnerId: match.winnerId,
        sets,
      };
    }),
  }));

  let result;
  
  if (game.gameType === GameType.AMERICANO || game.gameType === GameType.MEXICANO) {
    result = calculateAmericanoGameOutcomes(players, roundResults);
  } else {
    result = calculateClassicGameOutcomes(players, roundResults, game.gameType);
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

  for (const outcome of game.outcomes) {
    await tx.user.update({
      where: { id: outcome.userId },
      data: {
        level: outcome.levelBefore,
        reliability: outcome.reliabilityBefore,
        totalPoints: { decrement: outcome.pointsEarned },
        gamesPlayed: { decrement: 1 },
        gamesWon: { decrement: outcome.isWinner ? 1 : 0 },
      },
    });
  }

  await tx.gameOutcome.deleteMany({
    where: { gameId },
  });

  await tx.roundOutcome.deleteMany({
    where: {
      round: {
        gameId,
      },
    },
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
  }>,
  roundOutcomes: Record<number, Array<{
    userId: string;
    levelChange: number;
  }>>,
  tx: Prisma.TransactionClient
) {
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

  console.log(`[APPLY GAME OUTCOMES] Step 1: Updating match winners for game ${gameId}`);
  await updateMatchWinners(gameId, tx);
  
  console.log(`[APPLY GAME OUTCOMES] Step 2: Updating round outcomes for game ${gameId} (${game.rounds.length} rounds)`);
  for (const round of game.rounds) {
    await updateRoundOutcomes(gameId, round.id, game.winnerOfRound, tx);
  }
  
  console.log(`[APPLY GAME OUTCOMES] Step 3: Updating game outcomes for game ${gameId}`);
  await updateGameOutcomes(gameId, game.winnerOfGame, tx);

  for (const [roundIndex, outcomes] of Object.entries(roundOutcomes)) {
    const round = game.rounds[parseInt(roundIndex)];
    if (!round) continue;

    for (const outcome of outcomes) {
      await tx.roundOutcome.upsert({
        where: {
          roundId_userId: {
            roundId: round.id,
            userId: outcome.userId,
          },
        },
        create: {
          roundId: round.id,
          userId: outcome.userId,
          levelChange: outcome.levelChange,
        },
        update: {
          levelChange: outcome.levelChange,
        },
      });
    }
  }

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
      },
      update: {
        levelBefore,
        levelAfter,
        levelChange: outcome.levelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: outcome.reliabilityChange,
        pointsEarned: outcome.pointsEarned,
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
          gamesWon: { increment: outcome.isWinner ? 1 : 0 },
        },
      });
    }
  }

  const updatedGame = await tx.game.findUnique({
    where: { id: gameId },
    select: { startTime: true, endTime: true },
  });

  if (updatedGame) {
    const { calculateGameStatus } = await import('../../utils/gameStatus');
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
  }
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

  const userParticipant = game.participants.find(
    (p) => p.userId === requestUserId && (p.role === 'OWNER' || p.role === 'ADMIN')
  );

  if (!userParticipant && !game.resultsByAnyone) {
    console.log(`[RECALCULATE GAME OUTCOMES] User ${requestUserId} not authorized to recalculate outcomes for game ${gameId}`);
    throw new ApiError(403, 'Only game owners/admins can recalculate outcomes');
  }

  console.log(`[RECALCULATE GAME OUTCOMES] Game ${gameId} configuration: winnerOfMatch=${game.winnerOfMatch}, winnerOfRound=${game.winnerOfRound}, winnerOfGame=${game.winnerOfGame}`);

  return await prisma.$transaction(async (tx) => {
    console.log(`[RECALCULATE GAME OUTCOMES] Step 1: Undoing existing outcomes`);
    await undoGameOutcomes(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 2: Generating new outcomes`);
    const outcomeData = await generateGameOutcomes(gameId, tx);

    console.log(`[RECALCULATE GAME OUTCOMES] Step 3: Applying outcomes (${outcomeData.finalOutcomes.length} final outcomes, ${Object.keys(outcomeData.roundOutcomes).length} rounds)`);
    await applyGameOutcomes(
      gameId,
      outcomeData.finalOutcomes,
      outcomeData.roundOutcomes,
      tx
    );

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
}

