/**
 * PRD 357 — weather alerts on a game.
 *
 * Mounted at `/api/games` from `routes/index.ts` **before** `game.routes.ts`, so
 * `game.routes.ts`'s `/:id` routes cannot shadow anything declared here. The
 * flip side: a path declared here wins over the same path in `game.routes.ts` —
 * never declare a bare `/`, `/:id` or an existing `game.routes.ts` path here.
 *
 * In particular `GET /games/:id/weather` already exists in `game.routes.ts`
 * (the plain forecast, `controllers/weather.controller.ts#getGameWeather`) and
 * is **not** re-declared here — the alert state lives at `/:id/weather-alert`.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param } from 'express-validator';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { validate } from '../middleware/validate';
import { authenticate, canAccessGame, canEditGame } from '../middleware/auth';
import {
  getGameIndoorAlternatives,
  getGameWeatherAlert,
  keepGameAsPlanned,
  noteGameMovedIndoor,
} from '../controllers/gameWeather.controller';
// Importing the service here is what registers the `weather` push action
// handler and the `weatherRisk` Find-card enricher (import-time side effects on
// a module this already-mounted router pulls in).
import '../services/weather/weatherAlert.service';

const router = Router();

/** Reading the banner state is cheap but user-triggerable on every game open. */
const weatherReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'weather.rateLimit',
  },
});

/** Occupancy fans out to club integrations — keep it well below the read limit. */
const indoorAlternativesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'weather.indoorAlternativesRateLimit',
  },
});

const gameIdParam = param('id').isString().trim().notEmpty();

router.get(
  '/:id/weather-alert',
  authenticate,
  weatherReadLimiter,
  validate([gameIdParam]),
  canAccessGame,
  getGameWeatherAlert,
);

router.post(
  '/:id/weather-alert/keep',
  authenticate,
  weatherReadLimiter,
  validate([gameIdParam]),
  canEditGame,
  keepGameAsPlanned,
);

router.post(
  '/:id/weather-alert/moved-indoor',
  authenticate,
  weatherReadLimiter,
  validate([gameIdParam, body('courtId').isString().trim().notEmpty()]),
  canEditGame,
  noteGameMovedIndoor,
);

router.get(
  '/:id/indoor-alternatives',
  authenticate,
  indoorAlternativesLimiter,
  validate([gameIdParam]),
  canEditGame,
  getGameIndoorAlternatives,
);

export default router;
