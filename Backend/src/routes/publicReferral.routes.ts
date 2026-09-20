/**
 * PRD 351 — public referral landing (`?ref=CODE` resolution before sign-up).
 *
 * Mounted at `/api/public/referral` from `routes/index.ts`, alongside the other
 * unauthenticated `/public/*` routers (`/public/landings`, `/public/link-to-app`).
 * This path is new, so nothing here can collide with an existing router.
 *
 * Unauthenticated and enumerable, so: rate limited with the house
 * `rateLimitKeyFromRequest` key generator, and projected down to the referrer's
 * first name and avatar by `resolvePublicReferrer`. Do not widen that
 * projection — an 8-character code is short enough that a wider payload would
 * turn this into a people-search endpoint.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as referralController from '../controllers/referral.controller';

const router = Router();

const publicReferralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'referral.rateLimit',
  },
});

router.get('/:code', publicReferralLimiter, referralController.getPublicReferrer);

export default router;
