import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { getLevelName } from '../utils/ratingCalculator';
import { UrlConstructor } from '../utils/urlConstructor';

export const getLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '50', cityId } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where = cityId ? { currentCityId: cityId as string, isActive: true } : { isActive: true };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [
        { totalPoints: 'desc' },
        { level: 'desc' },
      ],
      skip,
      take: limitNum,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        level: true,
        gender: true,
        reliability: true,
        totalPoints: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const leaderboard = users.map((user: any, index: number) => ({
    rank: skip + index + 1,
    ...user,
    levelName: getLevelName(user.level),
    winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
  }));

  res.json({
    success: true,
    data: {
      leaderboard,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const getLevelLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '50', cityId } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where = cityId ? { currentCityId: cityId as string, isActive: true } : { isActive: true };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [
        { level: 'desc' },
        { reliability: 'desc' },
      ],
      skip,
      take: limitNum,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        level: true,
        gender: true,
        reliability: true,
        totalPoints: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const leaderboard = users.map((user: any, index: number) => ({
    rank: skip + index + 1,
    ...user,
    levelName: getLevelName(user.level),
    winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
  }));

  res.json({
    success: true,
    data: {
      leaderboard,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const getUserRanking = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
      gender: true,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
      currentCityId: true,
    },
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  const [globalRank, cityRank] = await Promise.all([
    prisma.user.count({
      where: {
        isActive: true,
        totalPoints: { gt: user.totalPoints },
      },
    }),
    user.currentCityId
      ? prisma.user.count({
          where: {
            isActive: true,
            currentCityId: user.currentCityId,
            totalPoints: { gt: user.totalPoints },
          },
        })
      : null,
  ]);

  res.json({
    success: true,
    data: {
      ...user,
      levelName: getLevelName(user.level),
      winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
      globalRank: globalRank + 1,
      cityRank: cityRank !== null ? cityRank + 1 : null,
    },
  });
});

export const getUserStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
      gender: true,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
    },
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  const recentGames = await prisma.gameOutcome.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      game: {
        select: {
          id: true,
          gameType: true,
          startTime: true,
        },
      },
    },
  });

  res.json({
    success: true,
    data: {
      user: {
        ...user,
        avatar: user.avatar ? UrlConstructor.constructImageUrl(user.avatar) : user.avatar,
        levelName: getLevelName(user.level),
        winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
      },
      recentGames,
    },
  });
});

