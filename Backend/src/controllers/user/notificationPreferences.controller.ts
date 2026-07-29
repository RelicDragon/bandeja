import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import {
  NotificationPreferenceService,
  type NotificationPreferenceData,
  PreferenceKey,
} from '../../services/notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';

const VALID_CHANNELS = Object.values(NotificationChannelType);
const VALID_PREFERENCE_KEYS = Object.values(PreferenceKey);

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

  const sanitized: Array<
    { channelType: NotificationChannelType } & Partial<
      Omit<NotificationPreferenceData, 'channelType'>
    >
  > = [];
  const seenChannels = new Set<NotificationChannelType>();
  for (const p of preferences) {
    if (!p.channelType || !VALID_CHANNELS.includes(p.channelType)) {
      throw new ApiError(400, `Invalid channelType: ${p.channelType}`);
    }
    if (seenChannels.has(p.channelType)) {
      throw new ApiError(400, `Duplicate channelType: ${p.channelType}`);
    }
    seenChannels.add(p.channelType);
    const unknownKey = Object.keys(p).find(
      (key) =>
        key !== 'channelType' &&
        !VALID_PREFERENCE_KEYS.includes(key as PreferenceKey),
    );
    if (unknownKey) {
      throw new ApiError(400, `Invalid notification preference: ${unknownKey}`);
    }
    const flags: Partial<Omit<NotificationPreferenceData, 'channelType'>> = {};
    for (const key of VALID_PREFERENCE_KEYS) {
      const value = p[key];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') {
        throw new ApiError(400, `${key} must be a boolean`);
      }
      flags[key] = value;
    }
    sanitized.push({ channelType: p.channelType, ...flags });
  }

  const updated = await NotificationPreferenceService.updateMany(userId, sanitized);
  res.json({
    success: true,
    data: updated,
  });
});
