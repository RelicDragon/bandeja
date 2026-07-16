import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  isDirectGiphyMediaUrl,
  isGiphySearchConfigured,
  rehostGiphyMediaUrl,
  searchGiphyGifs,
  trendingGiphyGifs,
  tryConsumeGiphyIngestRateLimit,
  tryConsumeGiphySearchRateLimit,
} from '../services/giphyIngest';

export const getStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: { available: isGiphySearchConfigured() },
  });
});

export const search = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });

  if (!isGiphySearchConfigured()) {
    throw new ApiError(503, 'Giphy search is not configured', true, {
      code: 'giphy.searchUnavailable',
    });
  }

  if (!tryConsumeGiphySearchRateLimit(userId)) {
    throw new ApiError(429, 'Too many Giphy searches', true, { code: 'giphy.searchRateLimited' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  try {
    const page = q.trim()
      ? await searchGiphyGifs(q, { offset, limit })
      : await trendingGiphyGifs({ offset, limit });
    res.json({ success: true, data: page });
  } catch (err) {
    if (err instanceof Error && err.message === 'GIPHY_API_KEY_MISSING') {
      throw new ApiError(503, 'Giphy search is not configured', true, {
        code: 'giphy.searchUnavailable',
      });
    }
    console.warn('[giphy] search failed', err instanceof Error ? err.message : err);
    throw new ApiError(502, 'Giphy search failed', true, { code: 'giphy.searchFailed' });
  }
});

export const trending = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });

  if (!isGiphySearchConfigured()) {
    throw new ApiError(503, 'Giphy search is not configured', true, {
      code: 'giphy.searchUnavailable',
    });
  }

  if (!tryConsumeGiphySearchRateLimit(userId)) {
    throw new ApiError(429, 'Too many Giphy searches', true, { code: 'giphy.searchRateLimited' });
  }

  const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  try {
    const page = await trendingGiphyGifs({ offset, limit });
    res.json({ success: true, data: page });
  } catch (err) {
    if (err instanceof Error && err.message === 'GIPHY_API_KEY_MISSING') {
      throw new ApiError(503, 'Giphy search is not configured', true, {
        code: 'giphy.searchUnavailable',
      });
    }
    console.warn('[giphy] trending failed', err instanceof Error ? err.message : err);
    throw new ApiError(502, 'Giphy search failed', true, { code: 'giphy.searchFailed' });
  }
});

/**
 * Re-host a Giphy download URL into chat media (never persists giphy.com in mediaUrls).
 * Client then creates a normal IMAGE message with the returned URLs.
 */
export const importGif = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });

  if (!isGiphySearchConfigured()) {
    throw new ApiError(503, 'Giphy search is not configured', true, {
      code: 'giphy.searchUnavailable',
    });
  }

  const rawUrl = typeof req.body?.downloadUrl === 'string' ? req.body.downloadUrl.trim() : '';
  if (!rawUrl) {
    throw new ApiError(400, 'Valid Giphy media downloadUrl is required', true, {
      code: 'giphy.invalidDownloadUrl',
    });
  }

  let downloadUrl = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    downloadUrl = parsed.toString();
  } catch {
    throw new ApiError(400, 'Valid Giphy media downloadUrl is required', true, {
      code: 'giphy.invalidDownloadUrl',
    });
  }

  if (!isDirectGiphyMediaUrl(downloadUrl)) {
    throw new ApiError(400, 'Valid Giphy media downloadUrl is required', true, {
      code: 'giphy.invalidDownloadUrl',
    });
  }

  if (!tryConsumeGiphyIngestRateLimit(userId)) {
    throw new ApiError(429, 'Too many Giphy imports', true, { code: 'giphy.importRateLimited' });
  }

  const result = await rehostGiphyMediaUrl(downloadUrl);
  if (!result) {
    throw new ApiError(422, 'Could not import GIF', true, { code: 'giphy.importFailed' });
  }

  res.json({
    success: true,
    data: {
      mediaUrl: result.mediaUrl,
      thumbnailUrl: result.thumbnailUrl,
    },
  });
});
