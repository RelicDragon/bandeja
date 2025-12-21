import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';

export const blockUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId: blockedUserId } = req.body;

  if (!blockedUserId) {
    throw new ApiError(400, 'errors.blockedUsers.userIdRequired');
  }

  if (req.userId === blockedUserId) {
    throw new ApiError(400, 'errors.blockedUsers.cannotBlockYourself');
  }

  const blockedUser = await prisma.user.findUnique({
    where: { id: blockedUserId },
  });

  if (!blockedUser) {
    throw new ApiError(404, 'errors.blockedUsers.userNotFound');
  }

  const existingBlock = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedUserId: {
        userId: req.userId!,
        blockedUserId,
      },
    },
  });

  if (existingBlock) {
    throw new ApiError(400, 'errors.blockedUsers.alreadyBlocked');
  }

  const block = await prisma.blockedUser.create({
    data: {
      userId: req.userId!,
      blockedUserId,
    },
    include: {
      blockedUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
    },
  });

  res.status(201).json({
    success: true,
    data: block,
  });
});

export const unblockUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId: blockedUserId } = req.params;

  const block = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedUserId: {
        userId: req.userId!,
        blockedUserId,
      },
    },
  });

  if (!block) {
    throw new ApiError(404, 'errors.blockedUsers.userNotBlocked');
  }

  await prisma.blockedUser.delete({
    where: {
      userId_blockedUserId: {
        userId: req.userId!,
        blockedUserId,
      },
    },
  });

  res.json({
    success: true,
    message: 'User unblocked',
  });
});

export const getBlockedUserIds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const blockedUsers = await prisma.blockedUser.findMany({
    where: { userId: req.userId! },
    select: {
      blockedUserId: true,
    },
  });

  const blockedUserIds = blockedUsers.map((block) => block.blockedUserId);

  res.json({
    success: true,
    data: blockedUserIds,
  });
});

export const getBlockedUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const blockedUsers = await prisma.blockedUser.findMany({
    where: { userId: req.userId! },
    include: {
      blockedUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  res.json({
    success: true,
    data: blockedUsers,
  });
});

export const checkIfUserBlocked = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId: blockedUserId } = req.params;

  const block = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedUserId: {
        userId: req.userId!,
        blockedUserId,
      },
    },
  });

  res.json({
    success: true,
    data: {
      isBlocked: !!block,
    },
  });
});

export const checkIfBlockedByUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const block = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedUserId: {
        userId,
        blockedUserId: req.userId!,
      },
    },
  });

  res.json({
    success: true,
    data: {
      isBlockedBy: !!block,
    },
  });
});

