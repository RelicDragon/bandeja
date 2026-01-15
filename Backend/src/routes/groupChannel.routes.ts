import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as groupChannelController from '../controllers/groupChannel.controller';

const router = Router();

router.post(
  '/',
  authenticate,
  validate([
    body('name').notEmpty().withMessage('Name is required').isLength({ max: 100 }).withMessage('Name must be 100 characters or less'),
    body('avatar').optional().isString(),
    body('isChannel').optional().isBoolean(),
    body('isPublic').optional().isBoolean(),
  ]),
  groupChannelController.createGroupChannel
);

router.get('/', authenticate, groupChannelController.getGroupChannels);
router.get('/public', authenticate, groupChannelController.getPublicGroupChannels);

router.get(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.getGroupChannelById
);

router.put(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
    body('name').optional().notEmpty().withMessage('Name cannot be empty').isLength({ max: 100 }).withMessage('Name must be 100 characters or less'),
    body('avatar').optional().isString(),
    body('isChannel').optional().isBoolean(),
    body('isPublic').optional().isBoolean(),
  ]),
  groupChannelController.updateGroupChannel
);

router.delete(
  '/:id',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.deleteGroupChannel
);

router.post(
  '/:id/join',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.joinGroupChannel
);

router.post(
  '/:id/leave',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.leaveGroupChannel
);

router.post(
  '/:id/invite',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
    body('receiverId').notEmpty().withMessage('receiverId is required'),
    body('message').optional().isString(),
  ]),
  groupChannelController.inviteUser
);

router.post(
  '/invites/:inviteId/accept',
  authenticate,
  validate([
    param('inviteId').notEmpty().withMessage('Invite ID is required'),
  ]),
  groupChannelController.acceptInvite
);

router.post(
  '/:id/hide',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.hideGroupChannel
);

router.post(
  '/:id/unhide',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.unhideGroupChannel
);

router.get(
  '/:id/messages',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.getGroupChannelMessages
);

router.get(
  '/:id/unread-count',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.getGroupChannelUnreadCount
);

router.post(
  '/:id/mark-read',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.markGroupChannelAsRead
);

router.get(
  '/:id/participants',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.getParticipants
);

router.get(
  '/:id/invites',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
  ]),
  groupChannelController.getInvites
);

router.post(
  '/:id/participants/:userId/promote',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
    param('userId').notEmpty().withMessage('User ID is required'),
  ]),
  groupChannelController.promoteToAdmin
);

router.post(
  '/:id/participants/:userId/remove-admin',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
    param('userId').notEmpty().withMessage('User ID is required'),
  ]),
  groupChannelController.removeAdmin
);

router.delete(
  '/:id/participants/:userId',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
    param('userId').notEmpty().withMessage('User ID is required'),
  ]),
  groupChannelController.removeParticipant
);

router.post(
  '/:id/transfer-ownership',
  authenticate,
  validate([
    param('id').notEmpty().withMessage('Group/Channel ID is required'),
    body('newOwnerId').notEmpty().withMessage('newOwnerId is required'),
  ]),
  groupChannelController.transferOwnership
);

router.delete(
  '/invites/:inviteId',
  authenticate,
  validate([
    param('inviteId').notEmpty().withMessage('Invite ID is required'),
  ]),
  groupChannelController.cancelInvite
);

export default router;
