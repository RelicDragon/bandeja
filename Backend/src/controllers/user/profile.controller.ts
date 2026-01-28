import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { ImageProcessor } from '../../utils/imageProcessor';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { config } from '../../config/env';
import { getClientIp, updateUserIpLocation } from '../../services/ipLocation.service';

export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  getClientIp(req).then((clientIp) => {
    if (clientIp && userId) updateUserIpLocation(userId, clientIp).catch((err) => console.error('IP location update failed', err));
  }).catch(() => {});
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: PROFILE_SELECT_FIELDS,
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const blockedUsers = await prisma.blockedUser.findMany({
    where: { userId: req.userId! },
    select: {
      blockedUserId: true,
    },
  });

  const blockedUserIds = blockedUsers.map((block) => block.blockedUserId);

  res.json({
    success: true,
    data: {
      ...user,
      blockedUserIds,
    },
  });
});

export const getIpLocation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { lastUserIP: true, latitudeByIP: true, longitudeByIP: true },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  res.json({
    success: true,
    data: {
      lastUserIP: user.lastUserIP,
      latitudeByIP: user.latitudeByIP,
      longitudeByIP: user.longitudeByIP,
    },
  });
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, email, avatar, originalAvatar, language, timeFormat, weekStart, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight, sendTelegramMessages, sendTelegramInvites, sendTelegramDirectMessages, sendTelegramReminders, sendTelegramWalletNotifications, sendPushMessages, sendPushInvites, sendPushDirectMessages, sendPushReminders, sendPushWalletNotifications } = req.body;
  
  // Explicitly ignore level and socialLevel - only backend can modify these

  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail && existingEmail.id !== req.userId) {
      throw new ApiError(400, 'Email already in use');
    }
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { avatar: true, originalAvatar: true, firstName: true, lastName: true }
  });

  if (firstName !== undefined || lastName !== undefined) {
    const newFirstName = firstName !== undefined ? firstName : currentUser?.firstName || '';
    const newLastName = lastName !== undefined ? lastName : currentUser?.lastName || '';
    const trimmedFirst = (newFirstName || '').trim();
    const trimmedLast = (newLastName || '').trim();

    if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
      throw new ApiError(400, 'At least one name must have at least 3 characters');
    }
  }

  if (avatar === null && currentUser?.avatar) {
    await ImageProcessor.deleteFile(currentUser.avatar);
  }
  if (originalAvatar === null && currentUser?.originalAvatar) {
    await ImageProcessor.deleteFile(currentUser.originalAvatar);
  }

  let finalGenderIsSet = genderIsSet;
  if (gender !== undefined && genderIsSet === undefined) {
    if (gender === 'MALE' || gender === 'FEMALE') {
      finalGenderIsSet = true;
    } else if (gender === 'PREFER_NOT_TO_SAY') {
      finalGenderIsSet = false;
    }
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
      ...(timeFormat !== undefined && { timeFormat }),
      ...(weekStart !== undefined && { weekStart }),
      ...(gender !== undefined && { gender }),
      ...(finalGenderIsSet !== undefined && { genderIsSet: finalGenderIsSet }),
      ...(preferredHandLeft !== undefined && { preferredHandLeft }),
      ...(preferredHandRight !== undefined && { preferredHandRight }),
      ...(preferredCourtSideLeft !== undefined && { preferredCourtSideLeft }),
      ...(preferredCourtSideRight !== undefined && { preferredCourtSideRight }),
      ...(sendTelegramMessages !== undefined && { sendTelegramMessages }),
      ...(sendTelegramInvites !== undefined && { sendTelegramInvites }),
      ...(sendTelegramDirectMessages !== undefined && { sendTelegramDirectMessages }),
      ...(sendTelegramReminders !== undefined && { sendTelegramReminders }),
      ...(sendTelegramWalletNotifications !== undefined && { sendTelegramWalletNotifications }),
      ...(sendPushMessages !== undefined && { sendPushMessages }),
      ...(sendPushInvites !== undefined && { sendPushInvites }),
      ...(sendPushDirectMessages !== undefined && { sendPushDirectMessages }),
      ...(sendPushReminders !== undefined && { sendPushReminders }),
      ...(sendPushWalletNotifications !== undefined && { sendPushWalletNotifications }),
    },
    select: PROFILE_SELECT_FIELDS,
  });

  res.json({
    success: true,
    data: {
      ...user,
    },
  });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'User ID is required');
  }

  const userId = req.userId;
  const deletedAvatarUrl = `${config.aws.cloudFrontDomain}/uploads/avatars/DeletedUser.png`;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      phone: true,
      email: true,
      telegramId: true,
      telegramUsername: true,
      firstName: true,
      lastName: true,
      avatar: true,
      originalAvatar: true,
      passwordHash: true,
      currentCityId: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await prisma.deletedUser.create({
    data: {
      originalUserId: userId,
      phone: user.phone,
      email: user.email,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      originalAvatar: user.originalAvatar,
      passwordHash: user.passwordHash,
      currentCityId: user.currentCityId,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      phone: null,
      email: null,
      telegramId: null,
      telegramUsername: null,
      appleSub: null,
      appleEmail: null,
      appleEmailVerified: false,
      googleId: null,
      googleEmail: null,
      googleEmailVerified: false,
      firstName: '###DELETED',
      lastName: null,
      passwordHash: null,
      currentCityId: null,
      isActive: false,
      avatar: deletedAvatarUrl,
      originalAvatar: deletedAvatarUrl,
    },
  });

  res.json({
    success: true,
    message: 'User deleted successfully',
  });
});

