import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as userController from '../controllers/user.controller';

const router = Router();

router.get('/profile', authenticate, userController.getProfile);

router.get('/ip-location', authenticate, userController.getIpLocation);

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

