/**
 * PRD 363 / 364 — `GET /public/platform-flags`.
 *
 * Unauthenticated on purpose: the flags gate optional UI (the organizer
 * "Next steps" block, the Find "looking to play" count) and must be readable
 * before sign-in so a guest and a member render the same shell. Nothing here
 * is per-user; the response is cacheable for five minutes.
 */
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import {
  PUBLIC_PLATFORM_FLAGS_MAX_AGE_SECONDS,
  resolvePublicPlatformFlags,
} from '../services/platformFlags.service';

export const getPublicPlatformFlags = asyncHandler(async (_req: Request, res: Response) => {
  const flags = await resolvePublicPlatformFlags();
  res.setHeader('Cache-Control', `public, max-age=${PUBLIC_PLATFORM_FLAGS_MAX_AGE_SECONDS}`);
  res.json({ success: true, data: { flags } });
});
