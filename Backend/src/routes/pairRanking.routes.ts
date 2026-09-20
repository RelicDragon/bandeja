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
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  getPairDetailHandler,
  getPairLeaderboardHandler,
  recalculatePairStatsHandler,
} from '../controllers/pairRanking.controller';

const router = Router();

router.post('/pairs/recalculate', authenticate, requireAdmin, recalculatePairStatsHandler);
router.get('/pairs', authenticate, getPairLeaderboardHandler);
router.get('/pairs/:pairId', authenticate, getPairDetailHandler);

export default router;
