import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { InviteStatus } from '@prisma/client';

const getGameInclude = () => ({
  club: {
    include: {
      courts: true,
      city: {
        select: {
          name: true,
        },
      },
    },
  },
  court: {
    include: {
      club: true,
    },
  },
  participants: {
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
  },
  invites: {
    where: {
      status: InviteStatus.PENDING,
    },
    include: {
      receiver: {
        select: USER_SELECT_FIELDS,
      },
    },
  },
  joinQueues: {
    where: {
      status: InviteStatus.PENDING,
    },
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  outcomes: {
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
    orderBy: { position: 'asc' },
  },
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
            orderBy: { setNumber: 'asc' as const },
          },
        },
        orderBy: { matchNumber: 'asc' as const },
      },
    },
    orderBy: { roundNumber: 'asc' as const },
  },
  fixedTeams: {
    include: {
      players: {
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
        },
      },
    },
    orderBy: { teamNumber: 'asc' },
  },
  gameCourts: {
    include: {
      court: {
        include: {
          club: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
        },
      },
    },
    orderBy: { order: 'asc' },
  },
});

export const getUserLevelChanges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      game: {
        include: getGameInclude() as any,
      },
    },
  });

  const result = levelChanges.map((event) => {
    const baseData = {
      id: event.id,
      levelBefore: event.levelBefore,
      levelAfter: event.levelAfter,
      eventType: event.eventType,
      linkEntityType: event.linkEntityType,
      createdAt: event.createdAt,
    };

    if (event.gameId && event.game) {
      return {
        ...baseData,
        game: event.game,
      };
    }

    return baseData;
  });

  res.json({
    success: true,
    data: result,
  });
});

export const getUserLevelChangesByUserId = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      levelBefore: true,
      levelAfter: true,
      eventType: true,
      gameId: true,
      createdAt: true,
    },
  });

  const result = levelChanges.map((event) => ({
    id: event.id,
    levelBefore: event.levelBefore,
    levelAfter: event.levelAfter,
    levelChange: event.levelAfter - event.levelBefore,
    gameId: event.gameId || '',
    eventType: event.eventType,
    createdAt: event.createdAt,
  }));

  res.json({
    success: true,
    data: result,
  });
});

export const getGameLevelChanges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: { gameId },
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const result = levelChanges.map((event) => ({
    id: event.id,
    userId: event.userId,
    levelBefore: event.levelBefore,
    levelAfter: event.levelAfter,
    levelChange: event.levelAfter - event.levelBefore,
    eventType: event.eventType,
    user: event.user,
    createdAt: event.createdAt,
  }));

  res.json({
    success: true,
    data: result,
  });
});

