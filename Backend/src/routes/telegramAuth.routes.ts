import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import * as telegramAuthController from '../controllers/telegramAuth.controller';

const router = Router();

router.post(
  '/verify-otp',
  validate([
    body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
  ]),
  telegramAuthController.verifyTelegramOtp
);

export default router;

