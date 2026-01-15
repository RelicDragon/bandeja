import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, canAccessGame } from '../middleware/auth';
import * as betController from '../controllers/bet.controller';

const router = Router();

router.get('/game/:gameId', authenticate, canAccessGame, betController.getGameBets);

router.post(
  '/',
  authenticate,
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required'),
    body('condition').notEmpty().withMessage('Condition is required'),
    body('stakeType').optional().isIn(['COINS', 'TEXT']),
    body('rewardType').optional().isIn(['COINS', 'TEXT']),
  ]),
  betController.createBet
);

router.post('/:id/accept', authenticate, betController.acceptBet);

router.put(
  '/:id',
  authenticate,
  validate([
    body('stakeType').optional().isIn(['COINS', 'TEXT']),
    body('rewardType').optional().isIn(['COINS', 'TEXT']),
  ]),
  betController.updateBet
);

router.delete('/:id', authenticate, betController.cancelBet);

export default router;
