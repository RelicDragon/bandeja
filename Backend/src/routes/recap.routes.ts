/**
 * PRD 353 — monthly recap. Paths live under `/me/recaps`.
 *
 * Mounted at `/api/users` from `routes/index.ts` **before** `user.routes.ts`, so
 * `user.routes.ts`'s `/:userId/…` routes cannot shadow anything declared here.
 * The flip side: a path declared here wins over the same path in
 * `user.routes.ts` — keep every path under `/me/recaps` and never declare a bare
 * `/:userId`. Anything this router does not match falls through to
 * `user.routes.ts`.
 *
 * `user.routes.ts` has no global middleware, so add `authenticate` explicitly on
 * every route here.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { param } from 'express-validator';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as recapController from '../controllers/recap.controller';

const router = Router();

const monthKeyParam = [
  param('monthKey')
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage('monthKey must be YYYY-MM'),
];

/**
 * Share and export each render PNGs through sharp and upload to S3, so they are
 * far more expensive than a read. A month has at most a handful of legitimate
 * shares, and a re-share is a full re-render.
 */
const recapRenderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'errors.recap.rateLimit',
    code: 'recap.rateLimit',
  },
});

router.get('/me/recaps', authenticate, recapController.listRecaps);

router.get(
  '/me/recaps/:monthKey',
  authenticate,
  validate(monthKeyParam),
  recapController.getRecap,
);

router.post(
  '/me/recaps/:monthKey/viewed',
  authenticate,
  validate(monthKeyParam),
  recapController.markRecapViewed,
);

router.post(
  '/me/recaps/:monthKey/share',
  authenticate,
  recapRenderLimiter,
  validate(monthKeyParam),
  recapController.shareRecap,
);

router.post(
  '/me/recaps/:monthKey/export',
  authenticate,
  recapRenderLimiter,
  validate(monthKeyParam),
  recapController.exportRecap,
);

/**
 * PRD 353 — operator backfill for a month the scheduler missed. Admin-only and
 * deliberately not under `/me`; mounted here so the recap surface stays in one
 * file. A pass walks every eligible user, so once an hour is plenty.
 */
const recapBackfillLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many backfills, please try again later.',
    code: 'recap.backfillRateLimit',
  },
});

router.post(
  '/recaps/backfill',
  authenticate,
  requireAdmin,
  recapBackfillLimiter,
  recapController.adminBackfillRecaps,
);

export default router;
