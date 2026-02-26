import { Router } from 'express';
import { NotificationChannelType } from '@prisma/client';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as userController from '../controllers/user.controller';

const welcomeScreenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
});

const router = Router();

router.get('/profile', authenticate, userController.getProfile);
router.post('/profile/sync-telegram', authenticate, userController.syncTelegramProfile);
router.get('/notification-preferences', authenticate, userController.getNotificationPreferences);
router.put(
  '/notification-preferences',
  authenticate,
  validate([
    body('preferences').isArray().withMessage('preferences must be an array'),
    body('preferences.*.channelType').isIn(Object.values(NotificationChannelType)).withMessage('Invalid channelType'),
  ]),
  userController.updateNotificationPreferences
);

router.get('/ip-location', authenticate, userController.getIpLocation);
router.get('/presence', authenticate, userController.getPresence);

router.put(
  '/profile',
  authenticate,
  validate([
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('verbalStatus').optional({ values: 'null' }).custom((v) => v == null || (typeof v === 'string' && v.length <= 32)).withMessage('Verbal status must be 32 characters or less'),
    body('bio').optional({ values: 'null' }).custom((v) => v == null || (typeof v === 'string' && v.length <= 128)).withMessage('Bio must be 128 characters or less'),
  ]),
  userController.updateProfile
);

router.post(
  '/switch-city',
  authenticate,
  validate([
    body('cityId').notEmpty().withMessage('City ID is required'),
  ]),
  userController.switchCity
);

router.post(
  '/set-initial-level',
  authenticate,
  validate([
    body('level').isFloat({ min: 0, max: 7 }).withMessage('Level must be between 0 and 7'),
  ]),
  userController.setInitialLevel
);

router.post(
  '/welcome-screen',
  authenticate,
  welcomeScreenLimiter,
  validate([
    body('answers')
      .isArray()
      .withMessage('answers must be an array')
      .custom((val: unknown) => {
        if (!Array.isArray(val) || val.length !== 5) {
          throw new Error('Exactly 5 answers required');
        }
        const valid = ['A', 'B', 'C', 'D'];
        for (let i = 0; i < val.length; i++) {
          if (typeof val[i] !== 'string' || !valid.includes(val[i] as string)) {
            throw new Error(`Answer ${i + 1} must be A, B, C, or D`);
          }
        }
        return true;
      }),
  ]),
  userController.completeWelcome
);

router.post('/welcome-screen/reset', authenticate, userController.resetWelcome);

router.post('/welcome-screen/skip', authenticate, userController.skipWelcome);

router.get('/compare/:otherUserId', authenticate, userController.getPlayerComparison);

router.get('/:userId/stats', authenticate, userController.getUserStats);

router.get('/invitable-players', authenticate, userController.getInvitablePlayers);

router.put(
  '/favorite-trainer',
  authenticate,
  validate([
    body('trainerId').optional({ nullable: true }).custom((v) => v === null || typeof v === 'string').withMessage('Trainer ID must be a string or null'),
  ]),
  userController.setFavoriteTrainer
);

router.post(
  '/track-interaction',
  authenticate,
  validate([
    body('targetUserId').notEmpty().withMessage('Target user ID is required'),
  ]),
  userController.trackUserInteraction
);

router.delete('/profile', authenticate, userController.deleteUser);

export default router;

