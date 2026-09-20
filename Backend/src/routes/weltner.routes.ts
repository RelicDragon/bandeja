import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, optionalAuth, type AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as service from '../services/weltner/weltner.service';

const router = Router();
const limit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});
const required = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new ApiError(400, 'weltner.invalidRequest');
  return value.trim();
};
router.use(limit);
router.get(
  '/clubs/:clubId/availability',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await service.getWeltnerAvailability(
        required(req.params.clubId),
        required(req.query.date),
      ),
    });
  }),
);
router.use(authenticate);
router.get(
  '/my-clubs',
  asyncHandler(async (req: AuthRequest, res) =>
    res.json({
      success: true,
      data: await service.getWeltnerMyClubs(req.userId!),
    }),
  ),
);
router.get(
  '/clubs/:clubId/auth',
  asyncHandler(async (req: AuthRequest, res) =>
    res.json({
      success: true,
      data: await service.getWeltnerAuth(req.userId!, required(req.params.clubId)),
    }),
  ),
);
router.put(
  '/clubs/:clubId/auth',
  asyncHandler(async (req: AuthRequest, res) =>
    res.json({
      success: true,
      data: await service.saveWeltnerAuth(
        req.userId!,
        required(req.params.clubId),
        req.body?.phoneNumber,
      ),
    }),
  ),
);
router.delete(
  '/clubs/:clubId/auth',
  asyncHandler(async (req: AuthRequest, res) => {
    await service.disconnectWeltner(req.userId!, required(req.params.clubId));
    res.json({ success: true });
  }),
);
router.get(
  '/clubs/:clubId/bookings',
  asyncHandler(async (req: AuthRequest, res) =>
    res.json({
      success: true,
      data: await service.listWeltnerBookings(req.userId!, required(req.params.clubId)),
    }),
  ),
);
router.post(
  '/clubs/:clubId/bookings',
  asyncHandler(async (req: AuthRequest, res) => {
    const durationMinutes = req.body?.durationMinutes;
    if (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes))
      throw new ApiError(400, 'weltner.invalidSlot');
    const data = await service.createWeltnerBooking({
      userId: req.userId!,
      clubId: required(req.params.clubId),
      courtId: required(req.body?.courtId),
      date: required(req.body?.date),
      startTime: required(req.body?.startTime),
      durationMinutes,
    });
    res.status(201).json({ success: true, data });
  }),
);
export default router;
