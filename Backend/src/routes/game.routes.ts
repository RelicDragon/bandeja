import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as gameController from '../controllers/game.controller';

const router = Router();

router.get('/', optionalAuth, gameController.getGames);

router.get('/:id', optionalAuth, gameController.getGameById);

router.post(
  '/',
  authenticate,
  validate([
    body('gameType').notEmpty().withMessage('Game type is required'),
    body('clubId').optional().isString().withMessage('Club ID must be a string'),
    body('courtId').optional().isString().withMessage('Court ID must be a string'),
    body('startTime').isISO8601().withMessage('Valid start time is required'),
    body('endTime').isISO8601().withMessage('Valid end time is required'),
  ]),
  gameController.createGame
);

router.put('/:id', authenticate, gameController.updateGame);

router.delete('/:id', authenticate, gameController.deleteGame);

router.post('/:id/join', authenticate, gameController.joinGame);

router.post('/:id/join-as-guest', authenticate, gameController.joinAsGuest);

router.post('/:id/leave', authenticate, gameController.leaveGame);

router.put(
  '/:id/toggle-playing-status',
  authenticate,
  validate([
    body('isPlaying').isBoolean().withMessage('isPlaying must be a boolean'),
  ]),
  gameController.togglePlayingStatus
);

router.post(
  '/:id/add-admin',
  authenticate,
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.addAdmin
);

router.post(
  '/:id/revoke-admin',
  authenticate,
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.revokeAdmin
);

router.post(
  '/:id/kick-user',
  authenticate,
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.kickUser
);

router.post(
  '/:id/transfer-ownership',
  authenticate,
  validate([
    body('userId').notEmpty().withMessage('User ID is required'),
  ]),
  gameController.transferOwnership
);

export default router;

