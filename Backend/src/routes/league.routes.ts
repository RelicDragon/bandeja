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

router.post(
  '/rounds/:leagueRoundId/games',
  authenticate,
  leagueController.createGameForRound
);

router.delete(
  '/rounds/:leagueRoundId',
  authenticate,
  leagueController.deleteLeagueRound
);

router.post(
  '/rounds/:leagueRoundId/send-start-message',
  authenticate,
  leagueController.sendRoundStartMessage
);

router.post(
  '/:leagueSeasonId/sync-participants',
  authenticate,
  leagueController.syncLeagueParticipants
);

router.get(
  '/:leagueSeasonId/groups',
  authenticate,
  leagueController.getLeagueGroups
);

router.post(
  '/:leagueSeasonId/groups',
  authenticate,
  validate([
    body('numberOfGroups').notEmpty().withMessage('Number of groups is required').isInt({ min: 1 }).withMessage('Number of groups must be at least 1'),
  ]),
  leagueController.createLeagueGroups
);

router.post(
  '/:leagueSeasonId/groups/manual',
  authenticate,
  validate([body('name').notEmpty().withMessage('Group name is required')]),
  leagueController.createManualLeagueGroup
);

router.patch(
  '/groups/:groupId',
  authenticate,
  validate([body('name').notEmpty().withMessage('Group name is required')]),
  leagueController.renameLeagueGroup
);

router.delete(
  '/groups/:groupId',
  authenticate,
  leagueController.deleteLeagueGroup
);

router.post(
  '/groups/:groupId/participants',
  authenticate,
  validate([body('participantId').notEmpty().withMessage('Participant ID is required')]),
  leagueController.addParticipantToLeagueGroup
);

router.delete(
  '/groups/:groupId/participants/:participantId',
  authenticate,
  leagueController.removeParticipantFromLeagueGroup
);

router.put(
  '/:leagueSeasonId/groups/reorder',
  authenticate,
  validate([
    body('groupIds').isArray({ min: 1 }).withMessage('Group IDs must be an array'),
    body('groupIds.*').isString().withMessage('Each group ID must be a string'),
  ]),
  leagueController.reorderLeagueGroups
);

export default router;

