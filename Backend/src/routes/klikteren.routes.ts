import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, optionalAuth } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as klikterenMyClubsController from '../controllers/klikterenMyClubs.controller';
import * as klikterenUpstreamController from '../controllers/klikterenUpstream.controller';

const router = Router();

const klikterenUpstreamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

router.get('/my-clubs', authenticate, klikterenMyClubsController.getMyKlikterenClubs);
router.get('/linked-games/:externalBookingId', authenticate, klikterenMyClubsController.getLinkedGames);

// Browser CORS blocks api.klikteren.com except Origin klikteren.com — proxy all FE traffic.
router.all(
  '/upstream/*path',
  klikterenUpstreamLimiter,
  optionalAuth,
  klikterenUpstreamController.proxyKlikterenUpstream,
);

export default router;
