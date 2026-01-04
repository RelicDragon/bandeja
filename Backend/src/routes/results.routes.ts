import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth, requireCanModifyResults } from '../middleware/auth';
import * as resultsController from '../controllers/results.controller';

const router = Router();

router.get('/game/:gameId', optionalAuth, resultsController.getGameResults);
router.get('/round/:roundId', optionalAuth, resultsController.getRoundResults);
router.get('/match/:matchId', optionalAuth, resultsController.getMatchResults);
router.get('/game/:gameId/outcome/:userId/explanation', optionalAuth, resultsController.getOutcomeExplanation);

router.post('/game/:gameId/recalculate', authenticate, requireCanModifyResults, resultsController.recalculateOutcomes);
router.post('/game/:gameId/reset', authenticate, requireCanModifyResults, resultsController.resetGameResults);
router.post(
  '/game/:gameId/edit', 
  authenticate, 
  requireCanModifyResults,
  resultsController.editGameResults
);

router.delete(
  '/game/:gameId', 
  authenticate,
  requireCanModifyResults,
  resultsController.deleteGameResults
);

router.post(
  '/game/:gameId/sync',
  authenticate,
  requireCanModifyResults,
  validate([
    body('rounds').isArray().withMessage('Rounds must be an array'),
  ]),
  resultsController.syncResults
);

router.post(
  '/game/:gameId/rounds',
  authenticate,
  requireCanModifyResults,
  validate([
    body('id').isString().withMessage('Round ID is required'),
    body('name').optional().isString(),
  ]),
  resultsController.createRound
);

router.delete(
  '/game/:gameId/rounds/:roundId',
  authenticate,
  requireCanModifyResults,
  resultsController.deleteRound
);

router.post(
  '/game/:gameId/rounds/:roundId/matches',
  authenticate,
  requireCanModifyResults,
  validate([
    body('id').isString().withMessage('Match ID is required'),
  ]),
  resultsController.createMatch
);

router.delete(
  '/game/:gameId/matches/:matchId',
  authenticate,
  requireCanModifyResults,
  resultsController.deleteMatch
);

router.put(
  '/game/:gameId/matches/:matchId',
  authenticate,
  requireCanModifyResults,
  validate([
    body('teamA').isArray().withMessage('teamA must be an array'),
    body('teamB').isArray().withMessage('teamB must be an array'),
    body('sets').isArray().withMessage('sets must be an array'),
  ]),
  resultsController.updateMatch
);

export default router;

