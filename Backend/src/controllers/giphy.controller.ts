import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  GiphyImportBusyError,
  isDirectGiphyMediaUrl,
  isDirectKlipyMediaUrl,
  isGifSearchConfigured,
  rehostGiphyMediaUrl,
  searchGiphyGifs,
  trendingGiphyGifs,
  consumeGiphyIngestRateLimit,
  consumeGiphySearchRateLimit,
} from '../services/giphyIngest';

const MAX_GIF_QUERY_LENGTH = 100;

function parseIntegerQuery(
  value: unknown,
  name: string,
  fallback: number | undefined,
  min: number,
  max: number
): number | undefined {
  if (value == null) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ApiError(400, `Invalid ${name}`, true, { code: 'giphy.invalidPagination' });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, `Invalid ${name}`, true, { code: 'giphy.invalidPagination' });
  }
  return parsed;
}

function parseProvider(value: unknown): 'GIPHY' | 'KLIPY' | undefined {
  if (value == null) return undefined;
  if (value === 'GIPHY' || value === 'KLIPY') return value;
  throw new ApiError(400, 'Invalid GIF provider', true, { code: 'giphy.invalidProvider' });
}

export const getStatus = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: { available: isGifSearchConfigured() },
  });
});

export const search = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });

  if (!isGifSearchConfigured()) {
    throw new ApiError(503, 'Giphy search is not configured', true, {
      code: 'giphy.searchUnavailable',
    });
  }

  if (req.query.q != null && typeof req.query.q !== 'string') {
    throw new ApiError(400, 'Invalid GIF search query', true, { code: 'giphy.invalidQuery' });
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length > MAX_GIF_QUERY_LENGTH) {
    throw new ApiError(400, 'GIF search query is too long', true, { code: 'giphy.invalidQuery' });
  }
  const offset = parseIntegerQuery(req.query.offset, 'offset', 0, 0, 10_000) ?? 0;
  const limit = parseIntegerQuery(req.query.limit, 'limit', undefined, 1, 50);
  const provider = parseProvider(req.query.provider);

  try {
    const deps = { authorizeCacheMiss: () => consumeGiphySearchRateLimit(userId) };
    const page = q.trim()
      ? await searchGiphyGifs(q, { offset, limit, provider }, deps)
      : await trendingGiphyGifs({ offset, limit, provider }, deps);
    res.json({ success: true, data: page });
  } catch (err) {
    if (err instanceof Error && err.message === 'GIF_SEARCH_RATE_LIMITED') {
      throw new ApiError(429, 'Too many Giphy searches', true, {
        code: 'giphy.searchRateLimited',
      });
    }
    if (err instanceof Error && err.message === 'GIF_SEARCH_NOT_CONFIGURED') {
      throw new ApiError(503, 'Giphy search is not configured', true, {
        code: 'giphy.searchUnavailable',
      });
    }
    if (err instanceof Error && err.message === 'GIF_SEARCH_PROVIDERS_COOLING_DOWN') {
      throw new ApiError(503, 'GIF search temporarily unavailable', true, {
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

  if (!isGifSearchConfigured()) {
    throw new ApiError(503, 'Giphy search is not configured', true, {
      code: 'giphy.searchUnavailable',
    });
  }

  const offset = parseIntegerQuery(req.query.offset, 'offset', 0, 0, 10_000) ?? 0;
  const limit = parseIntegerQuery(req.query.limit, 'limit', undefined, 1, 50);
  const provider = parseProvider(req.query.provider);

  try {
    const page = await trendingGiphyGifs(
      { offset, limit, provider },
      { authorizeCacheMiss: () => consumeGiphySearchRateLimit(userId) }
    );
    res.json({ success: true, data: page });
  } catch (err) {
    if (err instanceof Error && err.message === 'GIF_SEARCH_RATE_LIMITED') {
      throw new ApiError(429, 'Too many Giphy searches', true, {
        code: 'giphy.searchRateLimited',
      });
    }
    if (err instanceof Error && err.message === 'GIF_SEARCH_NOT_CONFIGURED') {
      throw new ApiError(503, 'Giphy search is not configured', true, {
        code: 'giphy.searchUnavailable',
      });
    }
    if (err instanceof Error && err.message === 'GIF_SEARCH_PROVIDERS_COOLING_DOWN') {
      throw new ApiError(503, 'GIF search temporarily unavailable', true, {
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

  const rawUrl = typeof req.body?.downloadUrl === 'string' ? req.body.downloadUrl.trim() : '';
  if (!rawUrl) {
    throw new ApiError(400, 'Valid GIF media downloadUrl is required', true, {
      code: 'giphy.invalidDownloadUrl',
    });
  }

  let downloadUrl = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    downloadUrl = parsed.toString();
  } catch {
    throw new ApiError(400, 'Valid GIF media downloadUrl is required', true, {
      code: 'giphy.invalidDownloadUrl',
    });
  }

  if (!isDirectGiphyMediaUrl(downloadUrl) && !isDirectKlipyMediaUrl(downloadUrl)) {
    throw new ApiError(400, 'Valid GIF media downloadUrl is required', true, {
      code: 'giphy.invalidDownloadUrl',
    });
  }

  if (!(await consumeGiphyIngestRateLimit(userId))) {
    throw new ApiError(429, 'Too many Giphy imports', true, { code: 'giphy.importRateLimited' });
  }

  let result;
  try {
    result = await rehostGiphyMediaUrl(downloadUrl);
  } catch (error) {
    if (error instanceof GiphyImportBusyError) {
      throw new ApiError(503, 'GIF import is busy', true, { code: 'giphy.importBusy' });
    }
    throw error;
  }
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
