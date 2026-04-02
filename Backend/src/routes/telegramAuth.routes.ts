import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as telegramAuthController from '../controllers/telegramAuth.controller';

const router = Router();

router.post(
  '/verify-otp',
  validate([
    body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
  ]),
  telegramAuthController.verifyTelegramOtp
);

router.post(
  '/verify-link-key',
  optionalAuth,
  validate([
    body('key').isString().isLength({ min: 20 }).withMessage('Invalid key'),
  ]),
  telegramAuthController.verifyTelegramLinkKey
);

export default router;

