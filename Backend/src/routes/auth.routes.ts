import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
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

router.post(
  '/register/apple',
  validate([
    body('identityToken').notEmpty().isString().withMessage('Identity token is required'),
    body('nonce').notEmpty().isString().isLength({ min: 1 }).withMessage('Nonce is required'),
    body('firstName').optional().isString().isLength({ max: 100 }).withMessage('First name must be a string with max 100 characters'),
    body('lastName').optional().isString().isLength({ max: 100 }).withMessage('Last name must be a string with max 100 characters'),
  ]),
  (req, res, next) => {
    console.log('[APPLE_ROUTE] POST /auth/register/apple');
    next();
  },
  authController.registerWithApple
);

router.post(
  '/login/apple',
  validate([
    body('identityToken').notEmpty().isString().withMessage('Identity token is required'),
    body('nonce').notEmpty().isString().isLength({ min: 1 }).withMessage('Nonce is required'),
    body('firstName').optional().isString().isLength({ max: 100 }).withMessage('First name must be a string with max 100 characters'),
    body('lastName').optional().isString().isLength({ max: 100 }).withMessage('Last name must be a string with max 100 characters'),
  ]),
  (req, res, next) => {
    console.log('[APPLE_ROUTE] POST /auth/login/apple');
    next();
  },
  authController.loginWithApple
);

router.post(
  '/register/google',
  validate([
    body('idToken').notEmpty().isString().withMessage('Google ID token is required'),
  ]),
  authController.registerWithGoogle
);

router.post(
  '/login/google',
  validate([
    body('idToken').notEmpty().isString().withMessage('Google ID token is required'),
  ]),
  authController.loginWithGoogle
);

router.post(
  '/link/apple',
  authenticate,
  validate([
    body('identityToken').notEmpty().isString().withMessage('Identity token is required'),
    body('nonce').notEmpty().isString().isLength({ min: 1 }).withMessage('Nonce is required'),
  ]),
  (req, res, next) => {
    console.log('[APPLE_ROUTE] POST /auth/link/apple');
    next();
  },
  authController.linkApple
);

router.post(
  '/unlink/apple',
  authenticate,
  (req, res, next) => {
    console.log('[APPLE_ROUTE] POST /auth/unlink/apple');
    next();
  },
  authController.unlinkApple
);

router.post(
  '/link/google',
  authenticate,
  validate([
    body('idToken').notEmpty().isString().withMessage('Google ID token is required'),
  ]),
  authController.linkGoogle
);

router.post(
  '/unlink/google',
  authenticate,
  authController.unlinkGoogle
);

export default router;

