import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as resultsController from '../controllers/results.controller';

const router = Router();

router.get('/game/:gameId', optionalAuth, resultsController.getGameResults);
router.get('/round/:roundId', optionalAuth, resultsController.getRoundResults);
router.get('/match/:matchId', optionalAuth, resultsController.getMatchResults);
router.get('/game/:gameId/outcome/:userId/explanation', optionalAuth, resultsController.getOutcomeExplanation);

router.post('/game/:gameId/recalculate', authenticate, resultsController.recalculateOutcomes);
router.post('/game/:gameId/reset', authenticate, resultsController.resetGameResults);
router.post(
  '/game/:gameId/edit', 
  authenticate, 
  resultsController.editGameResults
);

router.delete(
  '/game/:gameId', 
  authenticate,
  resultsController.deleteGameResults
);

router.post(
  '/game/:gameId/sync',
  authenticate,
  validate([
    body('rounds').isArray().withMessage('Rounds must be an array'),
  ]),
  resultsController.syncResults
);

router.post(
  '/game/:gameId/rounds',
  authenticate,
  validate([
    body('id').isString().withMessage('Round ID is required'),
    body('name').optional().isString(),
  ]),
  resultsController.createRound
);

router.delete(
  '/game/:gameId/rounds/:roundId',
  authenticate,
  resultsController.deleteRound
);

router.post(
  '/game/:gameId/rounds/:roundId/matches',
  authenticate,
  validate([
    body('id').isString().withMessage('Match ID is required'),
  ]),
  resultsController.createMatch
);

router.delete(
  '/game/:gameId/rounds/:roundId/matches/:matchId',
  authenticate,
  resultsController.deleteMatch
);

router.put(
  '/game/:gameId/rounds/:roundId/matches/:matchId',
  authenticate,
  validate([
    body('teamA').isArray().withMessage('teamA must be an array'),
    body('teamB').isArray().withMessage('teamB must be an array'),
    body('sets').isArray().withMessage('sets must be an array'),
    body('courtId').optional().isString(),
  ]),
  resultsController.updateMatch
);

export default router;

