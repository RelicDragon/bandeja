/**
 * PRD 358 — novice mode. Paths live under `/me/novice`.
 *
 * Mounted at `/api/users` from `routes/index.ts` **before** `user.routes.ts`
 * (same arrangement as `onboarding.routes.ts`), so nothing here can be shadowed
 * by a `/:userId/…` route. Keep every path under `/me/novice`.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as noviceController from '../controllers/novice.controller';

const router = Router();

const noviceWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'errors.onboarding.rateLimit',
    code: 'onboarding.rateLimit',
  },
});

router.get('/me/novice', authenticate, noviceController.getNovice);

router.post(
  '/me/novice/unlock-all',
  noviceWriteLimiter,
  authenticate,
  noviceController.postNoviceUnlockAll,
);

router.post(
  '/me/novice/milestone-seen',
  noviceWriteLimiter,
  authenticate,
  validate([body('rank').isInt({ min: 0, max: 5 }).withMessage('errors.novice.invalidRank')]),
  noviceController.postNoviceMilestoneSeen,
);

export default router;
