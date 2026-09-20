/**
 * PRD 354 — public club page (`GET /clubs/:id/public`, …).
 *
 * Mounted at `/api/clubs` from `routes/index.ts` **before** `club.routes.ts`, so
 * `club.routes.ts`'s `/:id` and `/:clubId/…` routes cannot shadow anything
 * declared here. The flip side: a path declared here wins over the same path in
 * `club.routes.ts` — never declare a bare `/:id` here. Anything this router does
 * not match falls through to `club.routes.ts`.
 *
 * The existing `GET /clubs/:id` runs under `optionalAuth` but returns the raw
 * `Club` row including `integrationConfig` (CONTRACT §1). The guest-readable
 * endpoints here are explicit whitelist projections — never `findUnique`
 * without a `select`.
 *
 * Everything here is read-only and guest-readable, so each route is rate
 * limited by client key rather than by user id.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as clubPublicController from '../controllers/clubPublic.controller';

const router = Router();

const publicClubLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many club page requests' },
  keyGenerator: (req) => (req as AuthRequest).userId ?? rateLimitKeyFromRequest(req),
});

router.get('/:id/public', publicClubLimiter, optionalAuth, clubPublicController.getPublicClubPage);
router.get('/:id/regulars', publicClubLimiter, optionalAuth, clubPublicController.getPublicClubRegulars);
router.get('/:id/public-games', publicClubLimiter, optionalAuth, clubPublicController.getPublicClubGames);
router.get('/:id/today-availability', publicClubLimiter, optionalAuth, clubPublicController.getPublicClubToday);

export default router;
