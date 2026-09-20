/**
 * PRD 349 — "Live now" rail.
 *
 * Mounted at `/api/live` from `routes/index.ts`; this path is new, so nothing
 * here can collide with an existing router.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, optionalAuth } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as liveGamesController from '../controllers/liveGames.controller';
/*
 * Importing the enricher module for its side effect registers `liveSummary` on
 * the available-games enricher registry. Registration is import-time, and this
 * router is mounted from `routes/index.ts`, so the chain always reaches
 * `app.ts` (wave-2 backend scaffold report §7).
 */
import '../services/game/liveGamesEnricher';

const router = Router();

/**
 * Spectator-token minting is the one endpoint here a stranger can hammer, so
 * it carries its own limiter. The token itself only ever unlocks a game that is
 * already public, live and rail-visible — but minting signs a JWT, and that
 * should not be free.
 */
const spectatorTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'live.spectatorTokenRateLimit',
  },
});

router.get('/games', authenticate, liveGamesController.getLiveGames);
router.get('/games/:id', authenticate, liveGamesController.getLiveGame);

/*
 * `optionalAuth`, not `authenticate`: the broadcast page is already public when
 * a `?spectatorToken=` is present, so a shared live link must work for a guest.
 * The controller's gate is what protects the data, not the session.
 */
router.post(
  '/games/:id/spectator-token',
  spectatorTokenLimiter,
  optionalAuth,
  liveGamesController.postLiveSpectatorToken,
);

export default router;
