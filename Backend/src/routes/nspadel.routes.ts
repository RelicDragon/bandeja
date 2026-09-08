import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, optionalAuth } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as nspadelMyClubsController from '../controllers/nspadelMyClubs.controller';
import * as nspadelUpstreamController from '../controllers/nspadelUpstream.controller';
import * as nspadelBookingsController from '../controllers/nspadelBookings.controller';

const router = Router();

const nspadelUpstreamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

router.get('/my-clubs', authenticate, nspadelMyClubsController.getMyNspadelClubs);
router.get('/linked-games/:externalBookingId', authenticate, nspadelMyClubsController.getLinkedGames);

// Real booking endpoints (server-side Supabase calls; anon key never leaves the backend).
router.get('/availability', nspadelUpstreamLimiter, optionalAuth, nspadelBookingsController.getAvailability);
router.post('/bookings', nspadelUpstreamLimiter, authenticate, nspadelBookingsController.createBooking);

// The club Supabase project is same-origin gated — proxy all FE traffic server-side.
router.all(
  '/upstream/*path',
  nspadelUpstreamLimiter,
  optionalAuth,
  nspadelUpstreamController.proxyNspadelUpstream,
);

export default router;
