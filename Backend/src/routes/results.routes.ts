import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as resultsController from '../controllers/results.controller';

const router = Router();

router.get('/game/:gameId', optionalAuth, resultsController.getGameResults);
router.get('/game/:gameId/generate', authenticate, resultsController.generateOutcomes);
router.get('/round/:roundId', optionalAuth, resultsController.getRoundResults);
router.get('/match/:matchId', optionalAuth, resultsController.getMatchResults);

router.post(
  '/game/:gameId',
  authenticate,
  validate([
    body('rounds').isArray().withMessage('Rounds must be an array'),
    body('rounds.*.roundNumber').isInt().withMessage('Round number is required'),
    body('rounds.*.matches').isArray().withMessage('Matches must be an array'),
    body('rounds.*.matches.*.matchNumber').isInt().withMessage('Match number is required'),
    body('rounds.*.matches.*.teams').isArray().withMessage('Teams must be an array'),
    body('rounds.*.matches.*.teams.*.teamNumber').isInt().withMessage('Team number is required'),
    body('rounds.*.matches.*.teams.*.playerIds').isArray().withMessage('Player IDs must be an array'),
    body('rounds.*.matches.*.sets').isArray().withMessage('Sets must be an array'),
    body('rounds.*.matches.*.sets.*.setNumber').isInt().withMessage('Set number is required'),
    body('rounds.*.matches.*.sets.*.teamAScore').isInt({ min: 0, max: 100 }).withMessage('Team A score must be 0-100'),
    body('rounds.*.matches.*.sets.*.teamBScore').isInt({ min: 0, max: 100 }).withMessage('Team B score must be 0-100'),
  ]),
  resultsController.saveGameResults
);

router.delete('/game/:gameId', authenticate, resultsController.deleteGameResults);

export default router;

