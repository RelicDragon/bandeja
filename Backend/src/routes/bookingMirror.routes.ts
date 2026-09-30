/**
 * `PUT /api/bookings/mirror` — the app syncs the user's own Booktime / Padeloo / Klikteren
 * booking list for one club (agent booking slice 7k). New endpoint only: older store builds
 * simply never call it.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { validateZod } from '../middleware/validateZod';
import { asyncHandler } from '../utils/asyncHandler';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import {
  externalBookingMirrorSyncBodySchema,
  syncExternalBookingMirror,
  type ExternalBookingMirrorSyncBody,
} from '../services/bookingMirror/externalBookingMirror.service';

const router = Router();

/** The app syncs at most once per provider + club per ~2 min; this bounds a runaway client. */
const mirrorSyncLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? rateLimitKeyFromRequest(req),
});

router.put(
  '/mirror',
  authenticate,
  mirrorSyncLimiter,
  validateZod({ body: externalBookingMirrorSyncBodySchema }),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = await syncExternalBookingMirror(req.userId!, req.body as ExternalBookingMirrorSyncBody);
    res.json({ success: true, data });
  }),
);

export default router;
