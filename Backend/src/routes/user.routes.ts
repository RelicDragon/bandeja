import { Router } from 'express';
import { NotificationChannelType } from '@prisma/client';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as userController from '../controllers/user.controller';

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

