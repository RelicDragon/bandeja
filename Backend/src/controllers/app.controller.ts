import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AppVersionService } from '../services/appVersion.service';
import { ApiError } from '../utils/ApiError';

export const checkVersion = asyncHandler(async (req: Request, res: Response) => {
  const { platform, buildNumber } = req.query;

  if (!platform || typeof platform !== 'string') {
    throw new ApiError(400, 'Platform is required');
  }

  const normalizedPlatform = platform.toLowerCase();
  if (normalizedPlatform !== 'ios' && normalizedPlatform !== 'android') {
    throw new ApiError(400, 'Platform must be either ios or android');
  }

  if (!buildNumber || isNaN(Number(buildNumber))) {
    throw new ApiError(400, 'Valid build number is required');
  }

  const buildNum = Number(buildNumber);
  if (buildNum <= 0) {
    throw new ApiError(400, 'Build number must be greater than 0');
  }

  const result = await AppVersionService.checkVersion(
    normalizedPlatform,
    buildNum
  );

  res.json({
    success: true,
    data: result,
  });
});
