import type { Response } from 'express';
import {
  isAchievementLeaderboardFamily,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import type { AuthRequest } from '../../middleware/auth';
import {
  getAchievementLeaderboardContext,
} from '../../services/ranking/achievementLeaderboard.service';
import { resolveLeaderboardGenderFilter } from '../../services/ranking/leaderboardGenderFilter';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

function firstQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === 'string');
  }
  return undefined;
}

export const getAchievementLeaderboard = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const family = firstQueryString(req.query.family);
    if (!isAchievementLeaderboardFamily(family)) {
      throw new ApiError(400, 'Invalid achievement family', true, {
        code: 'ranking.invalidAchievementFamily',
      });
    }

    const scope = firstQueryString(req.query.scope) ?? 'global';
    if (scope !== 'city' && scope !== 'global') {
      throw new ApiError(400, 'Invalid leaderboard scope', true, {
        code: 'ranking.invalidScope',
      });
    }

    const viewer = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, currentCityId: true },
    });
    if (!viewer) {
      throw new ApiError(404, 'User not found', true, {
        code: 'ranking.viewerNotFound',
      });
    }
    if (scope === 'city' && !viewer.currentCityId) {
      throw new ApiError(400, 'User does not have a city set', true, {
        code: 'ranking.viewerCityRequired',
      });
    }

    const data = await getAchievementLeaderboardContext({
      family,
      viewerUserId: viewer.id,
      currentCityId: scope === 'city' ? viewer.currentCityId : null,
      gender: resolveLeaderboardGenderFilter(req.query.gender),
    });

    res.json({ success: true, data });
  },
);
