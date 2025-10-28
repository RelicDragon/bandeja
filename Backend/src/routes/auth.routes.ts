import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post(
  '/register/phone',
  validate([
    body('phone').isMobilePhone('any').withMessage('Valid phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').notEmpty().withMessage('First name is required'),
  ]),
  authController.registerWithPhone
);

router.post(
  '/login/phone',
  validate([
    body('phone').isMobilePhone('any').withMessage('Valid phone number is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  authController.loginWithPhone
);

router.post(
  '/register/telegram',
  validate([
    body('telegramId').notEmpty().withMessage('Telegram ID is required'),
    body('firstName').notEmpty().withMessage('First name is required'),
  ]),
  authController.registerWithTelegram
);

router.post(
  '/login/telegram',
  validate([
    body('telegramId').notEmpty().withMessage('Telegram ID is required'),
  ]),
  authController.loginWithTelegram
);

export default router;

