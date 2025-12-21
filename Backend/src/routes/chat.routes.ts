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
  markAllMessagesAsRead,
  getUserChats,
  getOrCreateChatWithUser,
  getUserChatMessages,
  getUserChatUnreadCount,
  getUserChatsUnreadCounts,
  markUserChatAsRead,
  pinUserChat,
  unpinUserChat,
  getBugMessages,
  getBugLastUserMessage,
  getBugUnreadCount,
  getBugsUnreadCounts,
  markAllBugMessagesAsRead,
  reportMessage,
  getUnreadObjects
} from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.post(
  '/messages',
  validate([
    body('contextId').optional().isString().withMessage('Context ID must be a string'),
    body('gameId').optional().isString().withMessage('Game ID must be a string'),
    body('chatContextType').optional().isIn(['GAME', 'BUG', 'USER']).withMessage('Invalid chat context type'),
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
router.get('/unread-objects', getUnreadObjects);
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

// User Chat Routes
router.get('/user-chats', getUserChats);
router.get('/user-chats/with/:userId', getOrCreateChatWithUser);
router.get('/user-chats/:chatId/messages', getUserChatMessages);
router.get('/user-chats/:chatId/unread-count', getUserChatUnreadCount);
router.post('/user-chats/:chatId/mark-all-read', markUserChatAsRead);
router.post('/user-chats/:chatId/pin', pinUserChat);
router.delete('/user-chats/:chatId/pin', unpinUserChat);
router.post(
  '/user-chats/unread-counts',
  validate([
    body('chatIds').isArray().withMessage('Chat IDs must be an array'),
    body('chatIds.*').notEmpty().withMessage('Chat ID cannot be empty')
  ]),
  getUserChatsUnreadCounts
);

// Bug Chat Routes
router.get('/bugs/:bugId/messages', getBugMessages);
router.get('/bugs/:bugId/last-user-message', getBugLastUserMessage);
router.get('/bugs/:bugId/unread-count', getBugUnreadCount);
router.post('/bugs/:bugId/mark-all-read', markAllBugMessagesAsRead);
router.post(
  '/bugs/unread-counts',
  validate([
    body('bugIds').isArray().withMessage('Bug IDs must be an array'),
    body('bugIds.*').notEmpty().withMessage('Bug ID cannot be empty')
  ]),
  getBugsUnreadCounts
);

router.post(
  '/messages/:messageId/report',
  validate([
    param('messageId').notEmpty().withMessage('Message ID is required'),
    body('reason').isIn(['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_INFORMATION', 'OTHER']).withMessage('Invalid reason'),
    body('description').optional().isString().withMessage('Description must be a string')
  ]),
  reportMessage
);

export default router;
