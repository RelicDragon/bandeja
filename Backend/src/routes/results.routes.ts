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
  validate([
    body('baseVersion').optional().isInt({ min: 0 }).withMessage('Base version must be a non-negative integer'),
  ]),
  resultsController.editGameResults
);

router.delete(
  '/game/:gameId', 
  authenticate,
  validate([
    body('baseVersion').optional().isInt({ min: 0 }).withMessage('Base version must be a non-negative integer'),
  ]),
  resultsController.deleteGameResults
);

router.post(
  '/game/:gameId/ops:batch',
  authenticate,
  validate([
    body('ops').isArray().withMessage('Ops must be an array'),
    body('ops.*.id').isString().withMessage('Op ID is required'),
    body('ops.*.base_version').isInt({ min: 0 }).withMessage('Base version must be a non-negative integer'),
    body('ops.*.op').isIn(['replace', 'add', 'remove']).withMessage('Op type must be replace, add, or remove'),
    body('ops.*.path').isString().withMessage('Path is required'),
    body('ops.*.actor.userId').isString().withMessage('Actor user ID is required'),
  ]),
  resultsController.batchOps
);

export default router;

