import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  fetchLinkPreview,
  classifyLinkPreviewOutcome,
  fetchProxiedImageBytes,
  presentLinkPreviewForClient,
  isPersistableLinkPreview,
  issueLinkPreviewSnapshotToken,
  tryConsumeLinkPreviewRateLimit,
  verifyProxiedImageParams,
} from '../services/linkPreview';
import { SsrfFetchError } from '../services/linkPreview/ssrfSafePublicFetch';
import { assertPublicHttpsUrl } from '../services/linkPreview/ssrfSafePublicFetch';

export const getLinkPreview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });

  if (!tryConsumeLinkPreviewRateLimit(userId)) {
    res.setHeader('Retry-After', '60');
    throw new ApiError(429, 'Too many link preview requests', true, {
      code: 'linkPreview.rateLimited',
    });
  }

  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!url) {
    throw new ApiError(400, 'url is required', true, { code: 'linkPreview.urlRequired' });
  }

  const preview = await fetchLinkPreview(url, { viewerUserId: userId });
  res.json({
    success: true,
    data: presentLinkPreviewForClient(preview),
    meta: {
      outcome: classifyLinkPreviewOutcome(url, preview),
      snapshotToken:
        preview && isPersistableLinkPreview(preview)
          ? issueLinkPreviewSnapshotToken(preview)
          : null,
    },
  });
});

/** HMAC-signed OG/provider image proxy (no Bearer; signature is the auth). */
export const getLinkPreviewImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  let image: { url: string; width: number; height: number };
  try {
    image = verifyProxiedImageParams({
      url: typeof req.query.url === 'string' ? req.query.url : undefined,
      w: typeof req.query.w === 'string' ? req.query.w : undefined,
      h: typeof req.query.h === 'string' ? req.query.h : undefined,
      sig: typeof req.query.sig === 'string' ? req.query.sig : undefined,
    });
  } catch (err) {
    if (err instanceof SsrfFetchError) {
      throw new ApiError(400, err.message, true, { code: 'linkPreview.imageInvalid' });
    }
    throw err;
  }

  try {
    const { buffer, contentType, etag } = await fetchProxiedImageBytes(image.url, {
      width: image.width,
      height: image.height,
      accept: req.get('accept'),
    });
    if (req.get('if-none-match') === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Vary', 'Accept');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (err) {
    if (err instanceof SsrfFetchError) {
      throw new ApiError(502, 'Image fetch failed', true, { code: 'linkPreview.imageFetchFailed' });
    }
    throw err;
  }
});

/** Auth’d image proxy for persisted/canonical https thumbnails (Bearer). */
export const getLinkPreviewMedia = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });

  const raw = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!raw) {
    throw new ApiError(400, 'url is required', true, { code: 'linkPreview.urlRequired' });
  }

  let imageUrl: string;
  try {
    imageUrl = assertPublicHttpsUrl(raw).toString();
  } catch (err) {
    if (err instanceof SsrfFetchError) {
      throw new ApiError(400, err.message, true, { code: 'linkPreview.imageInvalid' });
    }
    throw err;
  }

  try {
    const { buffer, contentType, etag } = await fetchProxiedImageBytes(imageUrl, {
      accept: req.get('accept'),
    });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Vary', 'Accept');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (err) {
    if (err instanceof SsrfFetchError) {
      throw new ApiError(502, 'Image fetch failed', true, { code: 'linkPreview.imageFetchFailed' });
    }
    throw err;
  }
});
