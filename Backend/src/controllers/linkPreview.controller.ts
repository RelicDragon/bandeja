import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  fetchLinkPreview,
  tryConsumeLinkPreviewRateLimit,
} from '../services/linkPreview';

export const getLinkPreview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });

  if (!tryConsumeLinkPreviewRateLimit(userId)) {
    throw new ApiError(429, 'Too many link preview requests', true, {
      code: 'linkPreview.rateLimited',
    });
  }

  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!url) {
    throw new ApiError(400, 'url is required', true, { code: 'linkPreview.urlRequired' });
  }

  const preview = await fetchLinkPreview(url);
  res.json({ success: true, data: preview });
});
