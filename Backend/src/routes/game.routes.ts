import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth, canEditGame, canAccessGame, requireGamePermission } from '../middleware/auth';
import { ParticipantRole } from '@prisma/client';
import * as gameController from '../controllers/game.controller';

const router = Router();

router.get('/', optionalAuth, gameController.getGames);

router.get('/my-games', authenticate, gameController.getMyGames);

router.get('/my-games-with-unread', authenticate, gameController.getMyGamesWithUnread);

router.get('/past-games', authenticate, gameController.getPastGames);

router.get('/available', authenticate, gameController.getAvailableGames);

router.get('/booked-courts', authenticate, gameController.getBookedCourts);

router.get('/:id/workout/me', authenticate, canAccessGame, gameController.getMyGameWorkoutSummary);

router.post(
  '/:id/workout',
  authenticate,
  canAccessGame,
  validate([
    body('durationSeconds').isInt({ min: 1, max: 86400 }).withMessage('durationSeconds required'),
    body('startedAt').isISO8601().withMessage('startedAt required'),
    body('endedAt').isISO8601().withMessage('endedAt required'),
    body('totalEnergyKcal').optional({ nullable: true }).isFloat({ min: 0, max: 5000 }),
    body('avgHeartRate').optional({ nullable: true }).isFloat({ min: 35, max: 250 }),
    body('maxHeartRate').optional({ nullable: true }).isFloat({ min: 35, max: 250 }),
    body('source').optional().isIn(['APPLE_WATCH', 'ANDROID_HEALTH_CONNECT']),
    body('healthExternalId').optional({ nullable: true }).isString().isLength({ max: 512 }),
  ]),
  gameController.upsertGameWorkoutSummary
);

router.get('/:id', optionalAuth, gameController.getGameById);

router.post(
  '/',
  authenticate,
  validate([
    body('gameType')
      .custom((value, { req }) => {
        if (req.body.entityType === 'TRAINING') {
          return true;
        }
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          throw new Error('Game type is required');
        }
        return true;
      })
      .withMessage('Game type is required'),
    body('clubId').optional().isString().withMessage('Club ID must be a string'),
    body('courtId').optional().isString().withMessage('Court ID must be a string'),
    body('startTime').isISO8601().withMessage('Valid start time is required'),
    body('endTime').isISO8601().withMessage('Valid end time is required'),
  ]),
  gameController.createGame
);

router.put('/:id', authenticate, gameController.updateGame);

router.delete('/:id', authenticate, requireGamePermission([ParticipantRole.OWNER]), gameController.deleteGame);

router.post('/:id/join', authenticate, gameController.joinGame);

router.post('/:id/join-as-guest', authenticate, gameController.joinAsGuest);

router.post('/:id/leave-chat', authenticate, gameController.leaveChat);

router.post('/:id/leave', authenticate, gameController.leaveGame);

router.put(
  '/:id/toggle-playing-status',
  authenticate,
  validate([
    body('status').isIn(['PLAYING', 'IN_QUEUE']).withMessage('status must be PLAYING or IN_QUEUE'),
  ]),
  gameController.togglePlayingStatus
);

router.post(
  '/:id/add-admin',
  authenticate,
  requireGamePermission([ParticipantRole.OWNER]),
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.addAdmin
);

router.post(
  '/:id/revoke-admin',
  authenticate,
  requireGamePermission([ParticipantRole.OWNER]),
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.revokeAdmin
);

router.post(
  '/:id/set-trainer',
  authenticate,
  requireGamePermission([ParticipantRole.OWNER]),
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
    body('isTrainer').isBoolean().withMessage('isTrainer must be a boolean'),
  ]),
  gameController.setTrainer
);

router.post(
  '/:id/kick-user',
  authenticate,
  canEditGame,
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.kickUser
);

router.post(
  '/:id/transfer-ownership',
  authenticate,
  requireGamePermission([ParticipantRole.OWNER]),
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.transferOwnership
);

router.post(
  '/:id/accept-join-queue',
  authenticate,
  canEditGame,
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.acceptJoinQueue
);

router.post(
  '/:id/decline-join-queue',
  authenticate,
  canEditGame,
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.declineJoinQueue
);

router.post(
  '/:id/assign-league-participants',
  authenticate,
  canEditGame,
  validate([
    body('playerIds').isArray().withMessage('playerIds must be an array'),
    body('playerIds.*').isString().withMessage('Each player ID must be a string'),
  ]),
  gameController.assignLeagueParticipants
);

router.post(
  '/:id/cancel-join-queue',
  authenticate,
  gameController.cancelJoinQueue
);

router.get(
  '/:id/prepare-telegram-summary',
  authenticate,
  canAccessGame,
  gameController.prepareTelegramSummary
);

router.post(
  '/:id/send-results-to-telegram',
  authenticate,
  canAccessGame,
  gameController.sendResultsToTelegram
);

router.patch(
  '/:id/reset-telegram-results-sent',
  authenticate,
  canEditGame,
  gameController.resetTelegramResultsSent
);

export default router;

