import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import { NotificationPreferenceService, NotificationPreferenceData } from '../../services/notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';

const VALID_CHANNELS = Object.values(NotificationChannelType);

export const getNotificationPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const preferences = await NotificationPreferenceService.getForUser(userId);
  res.json({
    success: true,
    data: preferences,
  });
});

export const updateNotificationPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { preferences } = req.body as { preferences: Array<Partial<NotificationPreferenceData> & { channelType: NotificationChannelType }> };

  if (!Array.isArray(preferences)) {
    throw new ApiError(400, 'preferences must be an array');
  }

  for (const p of preferences) {
    if (!p.channelType || !VALID_CHANNELS.includes(p.channelType)) {
      throw new ApiError(400, `Invalid channelType: ${p.channelType}`);
    }
  }

  const updated = await NotificationPreferenceService.updateMany(userId, preferences);
  res.json({
    success: true,
    data: updated,
  });
});
