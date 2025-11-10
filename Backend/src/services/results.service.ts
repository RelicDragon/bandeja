import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { ParticipantRole } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../utils/constants';


export async function getGameResults(gameId: string) {
  const game = await prisma.game.findUnique({
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
              sets: {
                orderBy: { setNumber: 'asc' },
              },
            },
            orderBy: { matchNumber: 'asc' },
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
                    ...USER_SELECT_FIELDS,
                    reliability: true,
                  },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  return game;
}

export async function getRoundResults(roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
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
                    },
                  },
                },
              },
            },
          },
          sets: {
            orderBy: { setNumber: 'asc' },
          },
        },
        orderBy: { matchNumber: 'asc' },
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
  });

  if (!round) {
    throw new ApiError(404, 'Round not found');
  }

  return round;
}

export async function getMatchResults(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
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
                },
              },
            },
          },
        },
      },
      sets: {
        orderBy: { setNumber: 'asc' },
      },
    },
  });

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  return match;
}

export async function deleteGameResults(gameId: string, requestUserId: string, baseVersion?: number) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
      outcomes: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const userParticipant = game.participants.find(
    (p) => p.userId === requestUserId && (p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN)
  );

  if (!userParticipant) {
    throw new ApiError(403, 'Only game owners/admins can delete results');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(403, 'Cannot delete results for archived games');
  }

  const currentVersion = ((game.resultsMeta as any) as { version?: number })?.version || 0;
  
  if (baseVersion !== undefined && baseVersion !== currentVersion) {
    throw new ApiError(409, 'Version conflict: Results have been modified by another user. Please reload and try again.');
  }

  await prisma.$transaction(async (tx) => {
    if (game.affectsRating && game.outcomes.length > 0) {
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
    }

    await tx.round.deleteMany({
      where: { gameId },
    });

    await tx.gameOutcome.deleteMany({
      where: { gameId },
    });

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true },
    });
    
    if (updatedGame) {
      const { calculateGameStatus } = await import('../utils/gameStatus');
      await tx.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'NONE',
          metadata: {
            ...((game.metadata as any) || {}),
            resultsVersion: 0,
          },
          resultsMeta: {
            version: 0,
            processedOps: [],
          },
          status: calculateGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'NONE',
          }),
        },
      });
    }
  });
}

export async function editGameResults(gameId: string, requestUserId: string, baseVersion?: number) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
      outcomes: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const userParticipant = game.participants.find(
    (p) => p.userId === requestUserId && (p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN)
  );

  if (!userParticipant) {
    throw new ApiError(403, 'Only game owners/admins can edit results');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(403, 'Cannot edit results for archived games');
  }

  if (game.resultsStatus !== 'FINAL') {
    throw new ApiError(400, 'Can only edit results with FINAL status');
  }

  const currentVersion = ((game.resultsMeta as any) as { version?: number })?.version || 0;
  
  if (baseVersion !== undefined && baseVersion !== currentVersion) {
    throw new ApiError(409, 'Version conflict: Results have been modified by another user. Please reload and try again.');
  }

  await prisma.$transaction(async (tx) => {
    if (game.affectsRating && game.outcomes.length > 0) {
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

    const updatedGame = await tx.game.findUnique({
      where: { id: gameId },
      select: { startTime: true, endTime: true },
    });
    
    if (updatedGame) {
      const { calculateGameStatus } = await import('../utils/gameStatus');
      await tx.game.update({
        where: { id: gameId },
        data: {
          resultsStatus: 'IN_PROGRESS',
          status: calculateGameStatus({
            startTime: updatedGame.startTime,
            endTime: updatedGame.endTime,
            resultsStatus: 'IN_PROGRESS',
          }),
        },
      });
    }
  });
}

export { batchOps } from './results/batchOps.service';

