import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';

interface SyncLundaProfileRequest extends AuthRequest {
  body: {
    phone: string;
    gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
    level?: number;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
    metadata: any;
  };
}

export const syncLundaProfile = asyncHandler(async (req: SyncLundaProfileRequest, res: Response) => {
  const { phone, gender, level, preferredCourtSideLeft, preferredCourtSideRight, metadata } = req.body;
  const userId = req.userId!;

  // Update user profile with Lunda data
  const updateData: any = {};
  if (phone) updateData.phone = phone;
  if (gender) updateData.gender = gender;
  if (level !== undefined) updateData.level = level;
  if (preferredCourtSideLeft !== undefined) updateData.preferredCourtSideLeft = preferredCourtSideLeft;
  if (preferredCourtSideRight !== undefined) updateData.preferredCourtSideRight = preferredCourtSideRight;

  // Update user profile
  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  await prisma.lundaProfile.upsert({
    where: { userId },
    update: {
      metadata,
      updatedAt: new Date(),
    },
    create: {
      userId,
      metadata,
    },
  });

  res.json({
    success: true,
    message: 'Lunda profile synchronized successfully',
  });
});
