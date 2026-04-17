import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import { UserReactionEmojiUsageService } from '../../services/user/userReactionEmojiUsage.service';

export const getReactionEmojiUsage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  const raw = req.query.sinceVersion;
  const sinceVersion =
    typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : undefined;

  const result = await UserReactionEmojiUsageService.getMergedForUser(userId, sinceVersion);
  if (result.unchanged) {
    res.json({
      success: true,
      data: { version: result.version, unchanged: true, items: [] as [] },
    });
    return;
  }
  res.json({
    success: true,
    data: { version: result.version, items: result.items },
  });
});
