/**
 * PRD 351 — referral endpoints.
 *
 * Two surfaces with very different trust levels:
 * - the authenticated `/referrals/*` routes, which may return the viewer's own
 *   code, invite list and payout state;
 * - `GET /public/referral/:code`, which is unauthenticated and therefore
 *   returns a first name and an avatar and nothing else.
 */
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import {
  applyManualReferralCode,
  buildGameReferralLink,
  ensureReferralCode,
  getMyReferrer,
  getReferralSummary,
  resolvePublicReferrer,
} from '../services/referral/referral.service';

export const getMyReferralSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new ApiError(401, 'errors.unauthorized');
  const data = await getReferralSummary(req.userId);
  res.json({ success: true, data });
});

export const getMyReferralStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new ApiError(401, 'errors.unauthorized');
  const data = await getMyReferrer(req.userId);
  res.json({ success: true, data });
});

/** `GET /referrals/game-link/:gameId` — a game link carrying the viewer's `?ref=`. */
export const getGameInviteLink = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new ApiError(401, 'errors.unauthorized');
  const gameId = String(req.params.gameId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(gameId)) {
    throw new ApiError(400, 'referral.errors.invalidGame');
  }
  const code = await ensureReferralCode(req.userId);
  res.json({ success: true, data: { link: buildGameReferralLink(gameId, code), code } });
});

/** `POST /users/me/referral-code` — manual entry inside the 7-day window. */
export const postManualReferralCode = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new ApiError(401, 'errors.unauthorized');
  const body = (req.body ?? {}) as { code?: unknown };
  const data = await applyManualReferralCode(req.userId, body.code);
  res.json({ success: true, data });
});

/**
 * `GET /public/referral/:code` — unauthenticated landing resolution.
 *
 * Answers `{ found: false }` rather than 404 for an unknown code so the landing
 * page has one shape to render and so probing tells an attacker nothing beyond
 * what the rate limiter already allows.
 */
export const getPublicReferrer = asyncHandler(async (req: Request, res: Response) => {
  const referrer = await resolvePublicReferrer(req.params.code);
  res.json({
    success: true,
    data: referrer ? { found: true, ...referrer } : { found: false, firstName: null, avatar: null },
  });
});
