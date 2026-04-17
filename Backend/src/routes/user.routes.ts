import { Router } from 'express';
import { NotificationChannelType } from '@prisma/client';
import { body, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as userController from '../controllers/user.controller';
import { MAX_BASIC_USERS_IDS_PER_REQUEST } from '../services/user/basicUsersForMessage.service';

const MAX_BASIC_BY_IDS = MAX_BASIC_USERS_IDS_PER_REQUEST;

const basicByIdsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
});

const welcomeScreenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
});

const reactionEmojiUsageGetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
});

const router = Router();

router.get('/profile', authenticate, userController.getProfile);
router.get(
  '/me/reaction-emoji-usage',
  authenticate,
  reactionEmojiUsageGetLimiter,
  validate([query('sinceVersion').optional().isInt({ min: 0 }).withMessage('sinceVersion must be a non-negative integer')]),
  userController.getReactionEmojiUsage
);
router.get('/workout-sessions', authenticate, userController.getMyWorkoutSessions);
router.post('/profile/sync-telegram', authenticate, userController.syncTelegramProfile);
router.post('/profile/telegram-link-intent', authenticate, userController.createTelegramLinkIntent);
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
    body('cityIsSet').optional().isBoolean().withMessage('cityIsSet must be a boolean'),
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

router.get('/invitable-players', authenticate, userController.getInvitablePlayers);

router.post(
  '/basic-by-ids',
  authenticate,
  basicByIdsLimiter,
  validate([
    body('messageId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('messageId is required')
      .isLength({ max: 128 })
      .withMessage('messageId is too long'),
    body('ids').isArray({ max: MAX_BASIC_BY_IDS }).withMessage(`ids must be an array with at most ${MAX_BASIC_BY_IDS} items`),
    body('ids.*').isString().isLength({ min: 1, max: 64 }).withMessage('Each id must be a non-empty string'),
  ]),
  userController.getBasicUsersByIds
);

router.get('/:userId/stats', authenticate, userController.getUserStats);

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

