/**
 * PRD 352 — pair rankings (`/rankings/pairs`, …).
 *
 * Mounted at `/api/rankings` from `routes/index.ts` **before**
 * `ranking.routes.ts`. `ranking.routes.ts` declares only `/user-context` and
 * `/achievement-context` (no parameterised routes), so neither router can
 * shadow the other — just do not re-declare those two paths here. Anything this
 * router does not match falls through to `ranking.routes.ts`.
 *
 * The pairs list is cursor-paginated (CONTRACT §5.5) — `/rankings` has no
 * pagination today and the pair leaderboard is quadratic in players.
 *
 * `/pairs/recalculate` is declared before `/pairs/:pairId` so the literal path
 * can never be read as a pair id; they also differ in method.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import {
  getPairDetailHandler,
  getPairLeaderboardHandler,
  recalculatePairStatsHandler,
} from '../controllers/pairRanking.controller';

const router = Router();

/**
 * The windowed path (`period` other than `all`) aggregates a city's outcomes on
 * the fly, so it is the expensive one. Generous enough that switching sorts and
 * paging never trips it, tight enough that a loop cannot spin the aggregation.
 */
const pairReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'pairs.rateLimit',
  },
});

/** A full rebuild walks every FINAL game in the city — one at a time is plenty. */
const pairRebuildLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many rebuilds, please try again later.',
    code: 'pairs.rebuildRateLimit',
  },
});

router.post(
  '/pairs/recalculate',
  authenticate,
  requireAdmin,
  pairRebuildLimiter,
  recalculatePairStatsHandler,
);
router.get('/pairs', authenticate, pairReadLimiter, getPairLeaderboardHandler);
router.get('/pairs/:pairId', authenticate, pairReadLimiter, getPairDetailHandler);

export default router;
