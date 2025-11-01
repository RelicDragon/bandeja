import { Router } from 'express';
import { body, param } from 'express-validator';
import { ChatType } from '@prisma/client';
import {
  createMessage,
  getGameMessages,
  updateMessageState,
  markMessageAsRead,
  addReaction,
  removeReaction,
  deleteMessage,
  getUnreadCount,
  getUserChatGames,
  getGameUnreadCount,
  getGamesUnreadCounts,
  markAllMessagesAsRead
} from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.post(
  '/messages',
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required'),
    body('content').optional().isString().withMessage('Message content must be a string'),
    body('mediaUrls').optional().isArray().withMessage('Media URLs must be an array'),
    body('chatType').optional().isIn(Object.values(ChatType)).withMessage('Invalid chat type')
  ]),
  createMessage
);

router.get('/games/:gameId/messages', getGameMessages);
router.get('/games/:gameId/unread-count', getGameUnreadCount);
router.post(
  '/games/unread-counts',
  validate([
    body('gameIds').isArray().withMessage('Game IDs must be an array'),
    body('gameIds.*').notEmpty().withMessage('Game ID cannot be empty')
  ]),
  getGamesUnreadCounts
);
router.get('/unread-count', getUnreadCount);
router.get('/user-games', getUserChatGames);

router.patch(
  '/messages/:messageId/state',
  validate([
    param('messageId').notEmpty().withMessage('Message ID is required'),
    body('state').isIn(['SENT', 'DELIVERED', 'READ']).withMessage('Invalid message state')
  ]),
  updateMessageState
);

router.post('/messages/:messageId/read', markMessageAsRead);
router.post('/games/:gameId/mark-all-read', markAllMessagesAsRead);

router.post(
  '/messages/:messageId/reactions',
  validate([
    param('messageId').notEmpty().withMessage('Message ID is required'),
    body('emoji').notEmpty().withMessage('Emoji is required')
  ]),
  addReaction
);

router.delete('/messages/:messageId/reactions', removeReaction);
router.delete('/messages/:messageId', deleteMessage);

export default router;
