import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as leagueController from '../controllers/league.controller';

const router = Router();

router.post(
  '/',
  authenticate,
  validate([
    body('name').notEmpty().withMessage('League name is required'),
    body('cityId').notEmpty().withMessage('City is required'),
    body('season.startDate').notEmpty().withMessage('Start date is required').isISO8601().withMessage('Start date must be a valid date'),
    body('season.minLevel').optional().isFloat({ min: 1.0, max: 7.0 }),
    body('season.maxLevel').optional().isFloat({ min: 1.0, max: 7.0 }),
    body('season.maxParticipants').optional().isInt({ min: 4, max: 999 }),
  ]),
  leagueController.createLeague
);

router.get(
  '/:leagueSeasonId/rounds',
  authenticate,
  leagueController.getLeagueRounds
);

router.get(
  '/:leagueSeasonId/standings',
  authenticate,
  leagueController.getLeagueStandings
);

router.post(
  '/:leagueSeasonId/rounds',
  authenticate,
  leagueController.createLeagueRound
);

export default router;

