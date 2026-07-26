import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middleware/auth';
import {
  pinAchievementInstance,
  unpinAchievementInstance,
} from '../../services/achievements/achievementPin.service';

export const pinMyAchievement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const achievementId =
    typeof req.body?.achievementId === 'string' ? req.body.achievementId.trim() : '';
  if (!achievementId) {
    res.status(400).json({ success: false, message: 'achievementId is required' });
    return;
  }

  const preferredRaw = req.body?.slot;
  const preferredSlot =
    typeof preferredRaw === 'number' && Number.isInteger(preferredRaw)
      ? preferredRaw
      : typeof preferredRaw === 'string' &&
          preferredRaw.trim() !== '' &&
          Number.isInteger(Number(preferredRaw))
        ? Number(preferredRaw)
        : undefined;

  const result = await pinAchievementInstance({
    userId,
    achievementId,
    ...(preferredSlot != null ? { preferredSlot } : {}),
  });
  res.json({ success: true, data: { pin: result } });
});

export const unpinMyAchievement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const achievementId =
    typeof req.params.achievementId === 'string' ? req.params.achievementId.trim() : '';
  if (!achievementId) {
    res.status(400).json({ success: false, message: 'achievementId is required' });
    return;
  }

  const result = await unpinAchievementInstance({ userId, achievementId });
  res.json({ success: true, data: { pin: result } });
});
