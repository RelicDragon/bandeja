import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { ChatType } from '@prisma/client';
import {
  createMessage,
  getGameMessages,
  getGameParticipants,
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
  requestToChat,
  respondToChatRequest,
  getBugMessages,
  getBugUnreadCount,
  getBugsUnreadCounts,
  markAllBugMessagesAsRead,
  reportMessage,
  translateMessage,
  getUnreadObjects,
  muteChat,
  unmuteChat,
  isChatMuted,
  confirmMessageReceipt,
  getMissedMessages,
  markAllMessagesAsReadForContext,
  saveDraft,
  getDraft,
  getUserDrafts,
  deleteDraft,
  votePoll
} from '../controllers/chat.controller';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import rateLimit from 'express-rate-limit';

const router = Router();

router.use(authenticate);

const draftLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many draft requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const createMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many messages, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
  skipFailedRequests: true,
});

const unreadObjectsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many unread requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
});

router.post(
  '/messages',
  createMessageLimiter,
  validate([
    body('contextId').optional().isString().withMessage('Context ID must be a string'),
    body('gameId').optional().isString().withMessage('Game ID must be a string'),
    body('chatContextType').optional().isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid chat context type'),
    body('content').optional().isString().withMessage('Message content must be a string'),
    body('mediaUrls').optional().isArray().withMessage('Media URLs must be an array'),
    body('thumbnailUrls').optional().isArray().withMessage('Thumbnail URLs must be an array'),
    body('replyToId').optional().isString().withMessage('Reply to ID must be a string'),
    body('mentionIds').optional().isArray().withMessage('Mention IDs must be an array'),
    body('chatType').optional().isIn(Object.values(ChatType)).withMessage('Invalid chat type')
  ]),
  createMessage
);

router.post(
  '/polls/:pollId/vote',
  validate([
    param('pollId').notEmpty().withMessage('Poll ID is required'),
    body('optionIds').isArray().withMessage('Option IDs must be an array'),
    body('optionIds.*').optional().notEmpty().withMessage('Option ID cannot be empty')
  ]),
  votePoll
);

router.get('/games/:gameId/messages', getGameMessages);
router.get('/games/:gameId/participants', getGameParticipants);
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
router.get('/unread-objects', unreadObjectsLimiter, getUnreadObjects);
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
router.post('/user-chats/:chatId/request-to-chat', requestToChat);
router.post(
  '/user-chats/:chatId/request-to-chat/:messageId/respond',
  validate([
    param('chatId').notEmpty().withMessage('Chat ID is required'),
    param('messageId').notEmpty().withMessage('Message ID is required'),
    body('accepted').isBoolean().withMessage('accepted must be a boolean')
  ]),
  respondToChatRequest
);
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

router.post(
  '/messages/:messageId/translate',
  validate([
    param('messageId').notEmpty().withMessage('Message ID is required')
  ]),
  translateMessage
);

// Chat Mute Routes
router.post(
  '/mute',
  validate([
    body('chatContextType').isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid chat context type'),
    body('contextId').notEmpty().withMessage('Context ID is required')
  ]),
  muteChat
);

router.post(
  '/unmute',
  validate([
    body('chatContextType').isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid chat context type'),
    body('contextId').notEmpty().withMessage('Context ID is required')
  ]),
  unmuteChat
);

router.get(
  '/mute-status',
  validate([
    query('chatContextType').isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid chat context type'),
    query('contextId').notEmpty().withMessage('Context ID is required')
  ]),
  isChatMuted
);

router.post(
  '/messages/confirm-receipt',
  validate([
    body('messageId').notEmpty().withMessage('messageId is required'),
    body('deliveryMethod').isIn(['socket', 'push']).withMessage('deliveryMethod must be socket or push')
  ]),
  confirmMessageReceipt
);

router.get(
  '/messages/missed',
  validate([
    query('contextType').isIn(['GAME', 'BUG', 'USER']).withMessage('Invalid contextType'),
    query('contextId').notEmpty().withMessage('contextId is required'),
    query('lastMessageId').optional().isString().withMessage('lastMessageId must be a string')
  ]),
  getMissedMessages
);

router.post(
  '/mark-all-read',
  validate([
    body('contextType').isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid contextType'),
    body('contextId').notEmpty().withMessage('contextId is required'),
    body('chatTypes').optional().isArray().withMessage('chatTypes must be an array')
  ]),
  markAllMessagesAsReadForContext
);

router.post(
  '/drafts',
  draftLimiter,
  validate([
    body('chatContextType').isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid chat context type'),
    body('contextId').notEmpty().withMessage('Context ID is required'),
    body('chatType').optional().isIn(Object.values(ChatType)).withMessage('Invalid chat type'),
    body('content').optional().isString().isLength({ max: 10000 }).withMessage('Content must be a string and cannot exceed 10000 characters'),
    body('mentionIds').optional().isArray().isLength({ max: 50 }).withMessage('Mention IDs must be an array with maximum 50 items')
  ]),
  saveDraft
);

router.get(
  '/drafts',
  draftLimiter,
  validate([
    query('chatContextType').isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid chat context type'),
    query('contextId').notEmpty().withMessage('Context ID is required'),
    query('chatType').optional().isIn(Object.values(ChatType)).withMessage('Invalid chat type')
  ]),
  getDraft
);

router.get(
  '/drafts/all',
  draftLimiter,
  validate([
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ]),
  getUserDrafts
);

router.delete(
  '/drafts',
  draftLimiter,
  validate([
    body('chatContextType').isIn(['GAME', 'BUG', 'USER', 'GROUP']).withMessage('Invalid chat context type'),
    body('contextId').notEmpty().withMessage('Context ID is required'),
    body('chatType').optional().isIn(Object.values(ChatType)).withMessage('Invalid chat type')
  ]),
  deleteDraft
);

export default router;
