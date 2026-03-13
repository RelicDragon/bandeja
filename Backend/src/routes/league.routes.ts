import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, canEditGame } from '../middleware/auth';
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
  canEditGame,
  leagueController.createLeagueRound
);

router.post(
  '/:leagueSeasonId/playoff',
  authenticate,
  canEditGame,
  validate([
    body('gameType').isIn(['WINNER_COURT', 'AMERICANO']).withMessage('gameType must be WINNER_COURT or AMERICANO'),
    body('groups')
      .optional()
      .isArray({ min: 1 })
      .withMessage('groups must be a non-empty array when provided'),
    body('groups.*.leagueGroupId').optional().isString(),
    body('groups.*.participantIds').optional().isArray({ min: 4 }).withMessage('Each group must have at least 4 participantIds'),
    body('groups.*.participantIds.*').optional().isString(),
    body('participantIds').optional().isArray({ min: 4 }).withMessage('participantIds must be an array of at least 4 ids when not using groups'),
    body('participantIds.*').optional().isString(),
    body('leagueGroupId').optional().isString(),
    body().custom((value) => {
      const hasGroups = Array.isArray(value.groups) && value.groups.length > 0;
      const hasSingle = Array.isArray(value.participantIds) && value.participantIds.length >= 4;
      if (!hasGroups && !hasSingle) {
        throw new Error('Either groups (with at least one group of 4+ participantIds) or participantIds (min 4) is required');
      }
      if (hasGroups && hasSingle) {
        throw new Error('Provide either groups or participantIds, not both');
      }
      return true;
    }),
  ]),
  leagueController.createPlayoff
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
  canEditGame,
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
  canEditGame,
  validate([
    body('numberOfGroups').notEmpty().withMessage('Number of groups is required').isInt({ min: 1 }).withMessage('Number of groups must be at least 1'),
  ]),
  leagueController.createLeagueGroups
);

router.post(
  '/:leagueSeasonId/groups/manual',
  authenticate,
  canEditGame,
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
  canEditGame,
  validate([
    body('groupIds').isArray({ min: 1 }).withMessage('Group IDs must be an array'),
    body('groupIds.*').isString().withMessage('Each group ID must be a string'),
  ]),
  leagueController.reorderLeagueGroups
);

export default router;

