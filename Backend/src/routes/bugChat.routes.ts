import { Router } from 'express';
import { body, param } from 'express-validator';
import { ChatType } from '@prisma/client';
import {
  createBugMessage,
  getBugMessages,
  updateBugMessageState,
  markBugMessageAsRead,
  addBugReaction,
  removeBugReaction,
  deleteBugMessage,
  getBugUnreadCount,
  getUserBugChats,
  getBugChatUnreadCount,
  getBugsUnreadCounts
} from '../controllers/bugChat.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.post(
  '/messages',
  validate([
    body('bugId').notEmpty().withMessage('Bug ID is required'),
    body('content').optional().isString().withMessage('Message content must be a string'),
    body('mediaUrls').optional().isArray().withMessage('Media URLs must be an array'),
    body('chatType').optional().isIn(Object.values(ChatType)).withMessage('Invalid chat type')
  ]),
  createBugMessage
);

router.get('/bugs/:bugId/messages', getBugMessages);
router.get('/bugs/:bugId/unread-count', getBugChatUnreadCount);
router.post(
  '/bugs/unread-counts',
  validate([
    body('bugIds').isArray().withMessage('Bug IDs must be an array'),
    body('bugIds.*').notEmpty().withMessage('Bug ID cannot be empty')
  ]),
  getBugsUnreadCounts
);
router.get('/unread-count', getBugUnreadCount);
router.get('/user-bugs', getUserBugChats);

router.patch(
  '/messages/:messageId/state',
  validate([
    param('messageId').notEmpty().withMessage('Message ID is required'),
    body('state').isIn(['SENT', 'DELIVERED', 'READ']).withMessage('Invalid message state')
  ]),
  updateBugMessageState
);

router.post('/messages/:messageId/read', markBugMessageAsRead);

router.post(
  '/messages/:messageId/reactions',
  validate([
    param('messageId').notEmpty().withMessage('Message ID is required'),
    body('emoji').notEmpty().withMessage('Emoji is required')
  ]),
  addBugReaction
);

router.delete('/messages/:messageId/reactions', removeBugReaction);
router.delete('/messages/:messageId', deleteBugMessage);

export default router;
