import { Response } from 'express';
import { LevelChangeEventType, Sport } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../utils/constants';
import { projectGameUsersForSportContext } from '../services/game/read.service';
import { projectUserForSportContext } from '../services/user/userSportProfile.service';

const LEVEL_CHANGE_USER_SELECT = {
  ...USER_SELECT_FIELDS,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

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
        select: LEVEL_CHANGE_USER_SELECT,
      },
    },
  },
  outcomes: {
    include: {
      user: {
        select: LEVEL_CHANGE_USER_SELECT,
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
                    select: LEVEL_CHANGE_USER_SELECT,
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
            select: LEVEL_CHANGE_USER_SELECT,
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

function parseSportQuery(value: unknown): Sport | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const upper = value.trim().toUpperCase();
  if (Object.values(Sport).includes(upper as Sport)) {
    return upper as Sport;
  }
  return undefined;
}

function buildLevelChangeWhere(userId: string, sport?: Sport) {
  if (!sport) {
    return { userId };
  }
  return {
    userId,
    NOT: {
      eventType: {
        in: [LevelChangeEventType.SOCIAL_BAR, LevelChangeEventType.SOCIAL_PARTICIPANT],
      },
    },
    OR: [{ sport }, { sport: null, game: { sport } }],
  };
}

export const getUserLevelChanges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const sport = parseSportQuery(req.query.sport);

  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: buildLevelChangeWhere(userId, sport),
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
      levelChange: event.levelAfter - event.levelBefore,
      eventType: event.eventType,
      linkEntityType: event.linkEntityType,
      sport: event.sport,
      createdAt: event.createdAt,
    };

    if (event.gameId && event.game) {
      return {
        ...baseData,
        gameId: event.gameId,
        game: projectGameUsersForSportContext(event.game),
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
  const sport = parseSportQuery(req.query.sport);

  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: buildLevelChangeWhere(userId, sport),
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      levelBefore: true,
      levelAfter: true,
      eventType: true,
      linkEntityType: true,
      gameId: true,
      sport: true,
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
    linkEntityType: event.linkEntityType,
    sport: event.sport,
    createdAt: event.createdAt,
  }));

  res.json({
    success: true,
    data: result,
  });
});

export const getGameLevelChanges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { sport: true },
  });
  const sport = game?.sport ?? Sport.PADEL;

  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: { gameId },
    include: {
      user: {
        select: LEVEL_CHANGE_USER_SELECT,
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
    sport: event.sport,
    user: projectUserForSportContext(event.user, sport),
    createdAt: event.createdAt,
  }));

  res.json({
    success: true,
    data: result,
  });
});
