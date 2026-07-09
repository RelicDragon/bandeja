import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as telegramAuthController from '../controllers/telegramAuth.controller';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';

const router = Router();

const telegramAuthVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many Telegram login attempts' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

router.post(
  '/verify-otp',
  telegramAuthVerifyLimiter,
  validate([
    body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Code must be 6 digits'),
  ]),
  telegramAuthController.verifyTelegramOtp
);

router.post(
  '/verify-link-key',
  telegramAuthVerifyLimiter,
  optionalAuth,
  validate([
    body('key').isString().isLength({ min: 20 }).withMessage('Invalid key'),
    body('confirmMerge').optional().isBoolean().withMessage('confirmMerge must be a boolean'),
  ]),
  telegramAuthController.verifyTelegramLinkKey
);

export default router;
