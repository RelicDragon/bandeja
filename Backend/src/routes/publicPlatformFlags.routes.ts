/**
 * PRD 363 / 364 — public platform flags.
 *
 * Mounted at `/api/public/platform-flags` from `routes/index.ts`, next to the
 * other unauthenticated `/public/*` routers. Read-only; the write side stays on
 * the admin platform-settings routes (`requireAdmin`).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { getPublicPlatformFlags } from '../controllers/publicPlatformFlags.controller';

const router = Router();

const publicPlatformFlagsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'platformFlags.rateLimit',
  },
});

router.get('/', publicPlatformFlagsLimiter, getPublicPlatformFlags);

export default router;
