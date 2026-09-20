/**
 * PRD 345 — recurring game series.
 *
 * Mounted at `/api/series` from `routes/index.ts`; this path is new, so nothing
 * here can collide with an existing router. Every endpoint is gated on
 * `config.gameSeriesEnabled` (CONTRACT §7.7) — off means 404, not an empty
 * shell.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { config } from '../config/env';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import {
  addSeriesRegular,
  endSeries,
  getSeriesDetail,
  listMySeries,
  openSeriesChat,
  removeSeriesRegular,
  skipOccurrence,
  undoSkipOccurrence,
  updateSeries,
} from '../controllers/series.controller';

const router = Router();

/** Flag off ⇒ the whole surface is simply not there. */
const requireSeriesEnabled = (_req: Request, _res: Response, next: NextFunction) => {
  if (!config.gameSeriesEnabled) {
    next('router');
    return;
  }
  next();
};

/**
 * Series writes are cheap but repeatable (skip/undo is one tap). Generous
 * enough that a normal organizer never notices, tight enough that a loop
 * cannot spin the generator.
 */
const seriesWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

router.use(requireSeriesEnabled);
router.use(authenticate);

router.get('/', listMySeries);
router.get('/:id', getSeriesDetail);

router.patch('/:id', seriesWriteLimiter, updateSeries);
router.post('/:id/end', seriesWriteLimiter, endSeries);
router.post('/:id/skips', seriesWriteLimiter, skipOccurrence);
router.delete('/:id/skips/:occurrenceDate', seriesWriteLimiter, undoSkipOccurrence);
router.post('/:id/regulars', seriesWriteLimiter, addSeriesRegular);
router.delete('/:id/regulars/:userId', seriesWriteLimiter, removeSeriesRegular);
router.post('/:id/chat', seriesWriteLimiter, openSeriesChat);

export default router;
