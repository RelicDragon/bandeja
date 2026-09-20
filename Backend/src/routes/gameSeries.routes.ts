/**
 * PRD 345 — series endpoints that hang off a game (`POST /games/:id/series`,
 * the "same time next week?" prompt state and its answer).
 *
 * Mounted at `/api/games` from `routes/index.ts` **before** `game.routes.ts`, so
 * `game.routes.ts`'s `/:id` routes cannot shadow anything declared here. The
 * flip side: a path declared here wins over the same path in `game.routes.ts` —
 * never declare a bare `/`, `/:id` or an existing `game.routes.ts` path here.
 * Anything this router does not match falls through to `game.routes.ts`.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, canEditGame } from '../middleware/auth';
import { config } from '../config/env';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import {
  createSeriesFromGame,
  getSeriesNextOccurrence,
  respondToSeriesNextOccurrence,
} from '../controllers/series.controller';

const router = Router();

const requireSeriesEnabled = (_req: Request, _res: Response, next: NextFunction) => {
  if (!config.gameSeriesEnabled) {
    next('router');
    return;
  }
  next();
};

const seriesWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

router.use(requireSeriesEnabled);

// "Make this a weekly game" — owner/admin only, and `createSeriesFromGame`
// additionally refuses a game whose results have started.
router.post('/:id/series', authenticate, canEditGame, seriesWriteLimiter, createSeriesFromGame);

// The "Same time next week?" card and the organizer strip.
router.get('/:id/series-next', authenticate, getSeriesNextOccurrence);
router.post(
  '/:id/series-next',
  authenticate,
  seriesWriteLimiter,
  respondToSeriesNextOccurrence,
);

export default router;
