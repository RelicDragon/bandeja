import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { hasBlocked } from '../services/social-graph/socialGraph.block';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../utils/constants';
import { projectEmbeddedUserByPrimarySport } from '../services/user/projectEmbeddedBasicUsers';

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
        select: USER_SELECT_WITH_SPORT_PROFILES,
      },
    },
  });

  res.status(201).json({
    success: true,
    data: {
      ...block,
      blockedUser: projectEmbeddedUserByPrimarySport(block.blockedUser),
    },
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
        select: USER_SELECT_WITH_SPORT_PROFILES,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  res.json({
    success: true,
    data: blockedUsers.map((row) => ({
      ...row,
      blockedUser: projectEmbeddedUserByPrimarySport(row.blockedUser),
    })),
  });
});

export const checkIfUserBlocked = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId: blockedUserId } = req.params;

  const blocked = await hasBlocked(req.userId!, blockedUserId);

  res.json({
    success: true,
    data: {
      isBlocked: blocked,
    },
  });
});

export const checkIfBlockedByUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const blockedBy = await hasBlocked(userId, req.userId!);

  res.json({
    success: true,
    data: {
      isBlockedBy: blockedBy,
    },
  });
});

