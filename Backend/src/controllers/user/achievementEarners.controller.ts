import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { getFollowingAchievementEarners } from '../../services/achievements/followingAchievementEarners.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const getMyFollowingAchievementEarners = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const users = await getFollowingAchievementEarners(
      req.userId!,
      req.params.definitionId,
    );

    res.json({
      success: true,
      data: users,
    });
  },
);
