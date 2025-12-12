import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { UrlConstructor } from '../../utils/urlConstructor';
import { ImageProcessor } from '../../utils/imageProcessor';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';

export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: PROFILE_SELECT_FIELDS,
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
  const { firstName, lastName, email, avatar, originalAvatar, language, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight, sendTelegramMessages, sendTelegramInvites, sendTelegramDirectMessages, sendTelegramReminders } = req.body;

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
    },
    select: PROFILE_SELECT_FIELDS,
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

