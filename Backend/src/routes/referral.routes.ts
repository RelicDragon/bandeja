/**
 * PRD 351 — referrals (authenticated surface: my code, my referrals, rewards).
 *
 * Mounted at `/api/referrals` from `routes/index.ts`; this path is new, so
 * nothing here can collide with an existing router. The unauthenticated landing
 * surface lives in `publicReferral.routes.ts` under `/api/public/referral`.
 *
 * **Path deviation from the PRD:** manual code entry is `POST /referrals/me/code`
 * rather than `POST /users/me/referral-code`. `/users` is owned by
 * `user.routes.ts` (plus the pre-created onboarding/recap sub-routers) and
 * CONTRACT §5.5 forbids feature agents from touching `routes/index.ts`, so the
 * endpoint lives on the router this PRD actually owns. Semantics are unchanged.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as referralController from '../controllers/referral.controller';

const router = Router();

/**
 * Manual code entry is a guessing surface: 32^8 codes is far beyond brute
 * force, but a slow drip still has no legitimate use. Twenty attempts per
 * quarter hour is generous for a human typing a code off a screenshot.
 */
const referralCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'referral.errors.rateLimited',
    code: 'referral.rateLimit',
  },
});

router.get('/me', authenticate, referralController.getMyReferralSummary);
router.get('/me/status', authenticate, referralController.getMyReferralStatus);
router.post('/me/code', authenticate, referralCodeLimiter, referralController.postManualReferralCode);

export default router;
