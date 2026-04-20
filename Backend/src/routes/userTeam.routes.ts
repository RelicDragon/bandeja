import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as userTeamController from '../controllers/userTeam.controller';

const router = Router();

router.get('/memberships', authenticate, userTeamController.getMyMemberships);
router.get('/for-player-invite', authenticate, userTeamController.listTeamsForPlayerInvite);
router.get('/', authenticate, userTeamController.getMyTeams);
router.post(
  '/',
  authenticate,
  validate(userTeamController.createTeamValidators),
  userTeamController.createTeam
);
router.get('/:id', authenticate, userTeamController.getTeam);
router.put(
  '/:id',
  authenticate,
  validate(userTeamController.updateTeamValidators),
  userTeamController.updateTeam
);
router.delete('/:id', authenticate, userTeamController.deleteTeam);
router.post(
  '/:id/invite',
  authenticate,
  validate(userTeamController.inviteMemberValidators),
  userTeamController.inviteMember
);
router.post('/:id/accept', authenticate, userTeamController.acceptInvite);
router.post('/:id/decline', authenticate, userTeamController.declineInvite);
router.delete('/:id/members/:userId', authenticate, userTeamController.removeMember);

export default router;
