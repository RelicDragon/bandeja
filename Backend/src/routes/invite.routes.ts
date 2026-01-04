import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, canAccessGame } from '../middleware/auth';
import * as inviteController from '../controllers/invite.controller';

const router = Router();

router.get('/my-invites', authenticate, inviteController.getMyInvites);

router.get('/game/:gameId', authenticate, canAccessGame, inviteController.getGameInvites);

router.post(
  '/',
  authenticate,
  validate([
    body('receiverId').notEmpty().withMessage('Receiver ID is required'),
  ]),
  inviteController.sendInvite
);

router.post('/:id/accept', authenticate, inviteController.acceptInvite);

router.post('/:id/decline', authenticate, inviteController.declineInvite);

router.delete('/:id/cancel', authenticate, inviteController.cancelInvite);

router.delete('/expired', authenticate, inviteController.deleteExpiredInvites);

export default router;

