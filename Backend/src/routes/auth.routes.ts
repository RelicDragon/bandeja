import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';
import * as authRefreshController from '../controllers/authRefresh.controller';

const router = Router();

const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many refresh attempts' },
});

router.post(
  '/refresh',
  authRefreshLimiter,
  validate([body('refreshToken').optional({ checkFalsy: true }).isString()]),
  authRefreshController.postRefresh
);

router.post(
  '/logout',
  validate([body('refreshToken').optional({ checkFalsy: true }).isString()]),
  authRefreshController.postLogout
);

router.post('/logout-all', authenticate, authRefreshController.postLogoutAll);

router.get('/sessions', authenticate, authRefreshController.getSessions);

router.delete('/sessions/:id', authenticate, authRefreshController.deleteSession);

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
  '/login/apple',
  validate([
    body('identityToken').notEmpty().isString().withMessage('Identity token is required'),
    body('nonce').notEmpty().isString().isLength({ min: 1 }).withMessage('Nonce is required'),
    body('firstName').optional().isString().isLength({ max: 100 }).withMessage('First name must be a string with max 100 characters'),
    body('lastName').optional().isString().isLength({ max: 100 }).withMessage('Last name must be a string with max 100 characters'),
    body('language').optional().isString(),
    body('gender').optional().isString(),
    body('genderIsSet').optional().isBoolean(),
    body('preferredHandLeft').optional().isBoolean(),
    body('preferredHandRight').optional().isBoolean(),
    body('preferredCourtSideLeft').optional().isBoolean(),
    body('preferredCourtSideRight').optional().isBoolean(),
  ]),
  authController.loginWithApple
);

router.post(
  '/login/google',
  validate([
    body('idToken').notEmpty().isString().withMessage('Google ID token is required'),
    body('firstName').optional().isString().isLength({ max: 100 }).withMessage('First name must be a string with max 100 characters'),
    body('lastName').optional().isString().isLength({ max: 100 }).withMessage('Last name must be a string with max 100 characters'),
    body('language').optional().isString(),
    body('gender').optional().isString(),
    body('genderIsSet').optional().isBoolean(),
    body('preferredHandLeft').optional().isBoolean(),
    body('preferredHandRight').optional().isBoolean(),
    body('preferredCourtSideLeft').optional().isBoolean(),
    body('preferredCourtSideRight').optional().isBoolean(),
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
  authController.linkApple
);

router.post(
  '/unlink/apple',
  authenticate,
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

