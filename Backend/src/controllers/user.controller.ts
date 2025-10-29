import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { UrlConstructor } from '../utils/urlConstructor';
import { ImageProcessor } from '../utils/imageProcessor';
import { USER_SELECT_FIELDS } from '../utils/constants';

export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      phone: true,
      email: true,
      telegramId: true,
      telegramUsername: true,
      firstName: true,
      lastName: true,
      avatar: true,
      originalAvatar: true,
      level: true,
      socialLevel: true,
      gender: true,
      reliability: true,
      isAdmin: true,
      isTrainer: true,
      preferredHandLeft: true,
      preferredHandRight: true,
      preferredCourtSideLeft: true,
      preferredCourtSideRight: true,
      createdAt: true,
      currentCity: {
        select: {
          id: true,
          name: true,
          country: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.json({
    success: true,
    data: {
      ...user,
      //avatar: user.avatar ? UrlConstructor.constructImageUrl(user.avatar) : user.avatar,
      //originalAvatar: user.originalAvatar ? UrlConstructor.constructImageUrl(user.originalAvatar) : user.originalAvatar,
    },
  });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, email, avatar, originalAvatar, language, gender, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;

  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail && existingEmail.id !== req.userId) {
      throw new ApiError(400, 'Email already in use');
    }
  }

  // Get current user data to check for existing avatars
  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { avatar: true, originalAvatar: true }
  });

  // Delete old avatar files if they exist and we're setting them to null
  if (avatar === null && currentUser?.avatar) {
    await ImageProcessor.deleteFile(currentUser.avatar);
  }
  if (originalAvatar === null && currentUser?.originalAvatar) {
    await ImageProcessor.deleteFile(currentUser.originalAvatar);
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(email !== undefined && { email }),
      ...(avatar !== undefined && { avatar }),
      ...(originalAvatar !== undefined && { originalAvatar }),
      ...(language !== undefined && { language }),
      ...(gender !== undefined && { gender }),
      ...(preferredHandLeft !== undefined && { preferredHandLeft }),
      ...(preferredHandRight !== undefined && { preferredHandRight }),
      ...(preferredCourtSideLeft !== undefined && { preferredCourtSideLeft }),
      ...(preferredCourtSideRight !== undefined && { preferredCourtSideRight }),
    },
    select: {
      id: true,
      phone: true,
      email: true,
      telegramId: true,
      telegramUsername: true,
      firstName: true,
      lastName: true,
      avatar: true,
      originalAvatar: true,
      level: true,
      socialLevel: true,
      gender: true,
      reliability: true,
      isAdmin: true,
      isTrainer: true,
      preferredHandLeft: true,
      preferredHandRight: true,
      preferredCourtSideLeft: true,
      preferredCourtSideRight: true,
      createdAt: true,
      currentCity: {
        select: {
          id: true,
          name: true,
          country: true,
        },
      },
    },
  });

  res.json({
    success: true,
    data: {
      ...user,
      avatar: user.avatar ? UrlConstructor.constructImageUrl(user.avatar) : user.avatar,
      originalAvatar: user.originalAvatar ? UrlConstructor.constructImageUrl(user.originalAvatar) : user.originalAvatar,
    },
  });
});

export const switchCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.body;

  const city = await prisma.city.findUnique({
    where: { id: cityId },
  });

  if (!city) {
    throw new ApiError(404, 'City not found');
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { currentCityId: cityId },
    select: {
      id: true,
      phone: true,
      email: true,
      telegramId: true,
      telegramUsername: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
      socialLevel: true,
      gender: true,
      reliability: true,
      isAdmin: true,
      isTrainer: true,
      preferredHandLeft: true,
      preferredHandRight: true,
      preferredCourtSideLeft: true,
      preferredCourtSideRight: true,
      createdAt: true,
      currentCity: {
        select: {
          id: true,
          name: true,
          country: true,
        },
      },
    },
  });

  res.json({
    success: true,
    data: user,
  });
});

export const setInitialLevel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { level } = req.body;

  if (typeof level !== 'number' || level < 0 || level > 7) {
    throw new ApiError(400, 'Level must be a number between 0 and 7');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { gamesPlayed: true },
  });

  if (!currentUser) {
    throw new ApiError(404, 'User not found');
  }

  if (currentUser.gamesPlayed > 0) {
    throw new ApiError(400, 'Cannot set initial level after playing games');
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { level },
      select: {
      id: true,
      level: true,
      socialLevel: true,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
    },
  });

  res.json({
    success: true,
    data: user,
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
      originalAvatar: true,
      level: true,
      socialLevel: true,
      gender: true,
      reliability: true,
      isAdmin: true,
      isTrainer: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
      createdAt: true,
      preferredHandLeft: true,
      preferredHandRight: true,
      preferredCourtSideLeft: true,
      preferredCourtSideRight: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const levelHistory = await prisma.gameOutcome.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      levelBefore: true,
      levelAfter: true,
      levelChange: true,
      createdAt: true,
    },
  });

  const gamesLast30Days = await prisma.gameOutcome.count({
    where: {
      userId,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  res.json({
    success: true,
    data: {
      user: {
        ...user,
        //avatar: user.avatar ? UrlConstructor.constructImageUrl(user.avatar) : user.avatar,
        //originalAvatar: user.originalAvatar ? UrlConstructor.constructImageUrl(user.originalAvatar) : user.originalAvatar,
      },
      levelHistory: levelHistory.reverse(),
      gamesLast30Days,
    },
  });
});

export const getInvitablePlayers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.query;

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { currentCityId: true },
  });

  let participantIds: string[] = [];
  let cityId = currentUser?.currentCityId;

  if (gameId) {
    const game = await prisma.game.findUnique({
      where: { id: gameId as string },
      include: {
        participants: {
          select: {
            userId: true,
          },
        },
        club: {
          select: {
            cityId: true,
          },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    participantIds = game.participants.map((p: { userId: string }) => p.userId);
    cityId = game.club?.cityId || currentUser?.currentCityId;
  }

  const interactions = await prisma.userInteraction.findMany({
    where: { fromUserId: req.userId },
    select: {
      toUserId: true,
      count: true,
    },
  });

  const interactionMap = new Map(interactions.map((i: { toUserId: string; count: number }) => [i.toUserId, i.count]));

  const users = await prisma.user.findMany({
    where: {
      id: {
        notIn: [...participantIds, req.userId!],
      },
      isActive: true,
      OR: cityId ? [
        { currentCityId: cityId },
        { currentCityId: null }
      ] : undefined,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
      gender: true,
      isAdmin: true,
      isTrainer: true,
      telegramUsername: true,
    },
    take: 100,
  });

  const usersWithInteractions = users.map((user: any) => ({
    ...user,
    interactionCount: interactionMap.get(user.id) || 0,
  }));

  usersWithInteractions.sort((a: any, b: any) => b.interactionCount - a.interactionCount);

  res.json({
    success: true,
    data: usersWithInteractions,
  });
});

export const trackUserInteraction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { targetUserId } = req.body;

  if (!targetUserId) {
    throw new ApiError(400, 'Target user ID is required');
  }

  if (targetUserId === req.userId) {
    throw new ApiError(400, 'Cannot track interaction with yourself');
  }

  const interaction = await prisma.userInteraction.upsert({
    where: {
      fromUserId_toUserId: {
        fromUserId: req.userId!,
        toUserId: targetUserId,
      },
    },
    update: {
      count: {
        increment: 1,
      },
      lastInteractionAt: new Date(),
    },
    create: {
      fromUserId: req.userId!,
      toUserId: targetUserId,
      count: 1,
      lastInteractionAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: interaction,
  });
});

