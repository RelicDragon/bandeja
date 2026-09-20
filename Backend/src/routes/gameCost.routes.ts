/**
 * PRD 348 — cost split on a game (`/games/:id/cost-shares`, …).
 *
 * Mounted at `/api/games` from `routes/index.ts` **before** `game.routes.ts`, so
 * `game.routes.ts`'s `/:id` routes cannot shadow anything declared here. The
 * flip side: a path declared here wins over the same path in `game.routes.ts` —
 * never declare a bare `/`, `/:id` or an existing `game.routes.ts` path here.
 * Anything this router does not match falls through to `game.routes.ts`.
 *
 * Every endpoint is gated on `config.costSplitEnabled` inside the controller
 * (CONTRACT §7.7) and authorised by `services/gameCost/costSharePermissions.ts`.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as gameCostController from '../controllers/gameCost.controller';
import { registerPerHeadPriceEnricher } from '../services/gameCost/perHeadPrice.enricher';

const router = Router();

// The "10 € per player" card figure. Registered here so importing the router is
// the single thing that turns the feature on for Find / My games.
registerPerHeadPriceEnricher();

/** Marking, confirming and editing shares are cheap but user-triggered. */
const costWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'errors.cost.rateLimited',
    code: 'cost.rateLimit',
  },
});

/** A nudge costs other people a push, so it gets its own, much tighter bucket. */
const costRemindLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'errors.cost.remindCooldown',
    code: 'cost.remindRateLimit',
  },
});

router.get('/:id/cost-shares', authenticate, gameCostController.getCostShares);
router.put('/:id/cost-shares', authenticate, costWriteLimiter, gameCostController.putCostShares);
router.post(
  '/:id/cost-shares/me/paid',
  authenticate,
  costWriteLimiter,
  gameCostController.markMyShareAsPaid,
);
router.post(
  '/:id/cost-shares/:userId/confirm',
  authenticate,
  costWriteLimiter,
  gameCostController.confirmShare,
);
router.post(
  '/:id/cost-shares/remind',
  authenticate,
  costRemindLimiter,
  gameCostController.remindUnpaid,
);

export default router;
