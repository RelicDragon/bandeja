import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, canAccessGame, canEditGame } from '../middleware/auth';
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
  '/:leagueSeasonId/standings/recalculate',
  authenticate,
  canEditGame,
  leagueController.recalculateLeagueStandings
);

router.get(
  '/:leagueSeasonId/planner',
  authenticate,
  canAccessGame,
  leagueController.getLeaguePlanner
);

router.post(
  '/:leagueSeasonId/rounds/full-round-robin',
  authenticate,
  canEditGame,
  leagueController.createFullRegularRoundRobin
);

router.post(
  '/:leagueSeasonId/rounds/full-round-robin/recreate',
  authenticate,
  canEditGame,
  leagueController.recreateFullRegularRoundRobin
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
  '/:leagueSeasonId/playoff/bracket',
  authenticate,
  canEditGame,
  validate([
    body('bracketScope').optional().isIn(['PER_GROUP', 'CROSS_GROUP']),
    body('groups').optional().isArray({ min: 1 }),
    body('groups.*.leagueGroupId').optional().isString(),
    body('groups.*.participantIds').optional().isArray({ min: 2, max: 16 }),
    body('groups.*.participantIds.*').optional().isString(),
    body('includeThirdPlace').optional().isBoolean(),
    body('includeConsolationBracket').optional().isBoolean(),
    body('includeDoubleElimination').optional().isBoolean(),
    body('customByeSeedRanks').optional().isArray(),
    body('customByeSeedRanks.*').optional().isInt({ min: 1, max: 16 }),
    body('customPlayInPairings').optional().isArray(),
    body('customPlayInPairings.*.seedA').optional().isInt({ min: 1, max: 16 }),
    body('customPlayInPairings.*.seedB').optional().isInt({ min: 1, max: 16 }),
    body('includeConsolationBracket').optional().isBoolean(),
    body('groups.*.includeThirdPlace').optional().isBoolean(),
    body('groups.*.includeConsolationBracket').optional().isBoolean(),
    body('groups.*.includeDoubleElimination').optional().isBoolean(),
    body('groups.*.customByeSeedRanks').optional().isArray(),
    body('groups.*.customByeSeedRanks.*').optional().isInt({ min: 1, max: 16 }),
    body('crossGroup.includeThirdPlace').optional().isBoolean(),
    body('crossGroup.includeConsolationBracket').optional().isBoolean(),
    body('crossGroup.includeDoubleElimination').optional().isBoolean(),
    body('crossGroup.customByeSeedRanks').optional().isArray(),
    body('crossGroup.customByeSeedRanks.*').optional().isInt({ min: 1, max: 16 }),
    body('groups.*.includeThirdPlace').optional().isBoolean(),
    body('groups.*.includeConsolationBracket').optional().isBoolean(),
    body('groups.*.includeDoubleElimination').optional().isBoolean(),
    body('groups.*.customByeSeedRanks').optional().isArray(),
    body('groups.*.customByeSeedRanks.*').optional().isInt({ min: 1, max: 16 }),
    body('crossGroup.includeThirdPlace').optional().isBoolean(),
    body('crossGroup.includeConsolationBracket').optional().isBoolean(),
    body('crossGroup.includeDoubleElimination').optional().isBoolean(),
    body('crossGroup.customByeSeedRanks').optional().isArray(),
    body('crossGroup.customByeSeedRanks.*').optional().isInt({ min: 1, max: 16 }),
    body('crossGroup.equalTopK').optional().isInt({ min: 1, max: 16 }),
    body('crossGroup.unequalK').optional().isBoolean(),
    body('crossGroup.teamsPerGroup').optional().isArray({ min: 1 }),
    body('crossGroup.teamsPerGroup.*.leagueGroupId').optional().isString(),
    body('crossGroup.teamsPerGroup.*.k').optional().isInt({ min: 1, max: 16 }),
    body('crossGroup.customPlayInPairings').optional().isArray(),
    body('crossGroup.customPlayInPairings.*.seedA').optional().isInt({ min: 1, max: 16 }),
    body('crossGroup.customPlayInPairings.*.seedB').optional().isInt({ min: 1, max: 16 }),
    body('crossGroup.includeConsolationBracket').optional().isBoolean(),
    body('crossGroup.includedGroupIds').optional().isArray({ min: 2 }),
    body('crossGroup.includedGroupIds.*').optional().isString(),
    body('crossGroup.seedingPreset')
      .optional()
      .isIn(['WINNERS_THEN_RUNNERS_UP', 'GROUP_BLOCK', 'MANUAL']),
    body('crossGroup.globalParticipantIds').optional().isArray({ min: 2, max: 16 }),
    body('crossGroup.globalParticipantIds.*').optional().isString(),
    body('crossGroup.qualifiers').optional().isArray({ min: 1 }),
    body('crossGroup.qualifiers.*.leagueGroupId').optional().isString(),
    body('crossGroup.qualifiers.*.participantIds').optional().isArray({ min: 1, max: 16 }),
    body('crossGroup.qualifiers.*.participantIds.*').optional().isString(),
    body().custom((value) => {
      const scope = value.bracketScope ?? 'PER_GROUP';
      const hasGroups = Array.isArray(value.groups) && value.groups.length > 0;
      const hasCross = value.crossGroup != null && typeof value.crossGroup === 'object';
      if (hasGroups && hasCross) {
        throw new Error('Provide either groups or crossGroup, not both');
      }
      if (scope === 'CROSS_GROUP') {
        if (!hasCross) {
          throw new Error('crossGroup is required when bracketScope is CROSS_GROUP');
        }
        if (hasGroups) {
          throw new Error('groups must not be sent for CROSS_GROUP bracket');
        }
        const cg = value.crossGroup;
        const useUnequal = cg?.unequalK === true || (cg?.teamsPerGroup?.length ?? 0) > 0;
        if (!useUnequal) {
          const k = cg?.equalTopK;
          if (!Number.isInteger(k) || k < 1) {
            throw new Error('crossGroup.equalTopK is required for equal-K cross-group bracket');
          }
        }
        return true;
      }
      if (hasCross) {
        throw new Error('crossGroup requires bracketScope CROSS_GROUP');
      }
      if (!hasGroups) {
        throw new Error('groups must be a non-empty array for PER_GROUP bracket');
      }
      return true;
    }),
  ]),
  leagueController.createBracketPlayoff
);

router.get(
  '/:leagueSeasonId/playoff/bracket',
  authenticate,
  leagueController.getBracketPlayoff
);

router.post(
  '/:leagueSeasonId/playoff/bracket/notify-summary',
  authenticate,
  canEditGame,
  validate([
    body('roundId').optional().isString(),
    body('leagueGroupId').optional().isString(),
  ]),
  leagueController.notifyBracketPlayoffSummary
);

router.patch(
  '/:leagueSeasonId/playoff/bracket/slots',
  authenticate,
  canEditGame,
  validate([
    body('slots').optional().isArray(),
    body('slots.*.slotId').optional().isString(),
    body('slots.*.leagueParticipantId').optional({ nullable: true }).isString(),
    body('slots.*.side').optional().isIn(['A', 'B']),
    body('gameTeamUpdates').optional().isArray(),
    body('gameTeamUpdates.*.gameId').optional().isString(),
    body('gameTeamUpdates.*.participantA').optional().isString(),
    body('gameTeamUpdates.*.participantB').optional().isString(),
    body('roundId').optional().isString(),
  ]),
  leagueController.patchBracketPlayoffSlots
);

router.post(
  '/:leagueSeasonId/playoff/bracket/slots/:slotId/walkover',
  authenticate,
  canEditGame,
  validate([
    body('leagueParticipantId').isString(),
    body('skipGameFinal').optional().isBoolean(),
  ]),
  leagueController.applyBracketSlotWalkover
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

