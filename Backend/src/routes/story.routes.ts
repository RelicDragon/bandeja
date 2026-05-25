import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload, uploadChatVideoMulter } from '../controllers/media.controller';
import * as storyController from '../controllers/story.controller';
import * as engagementController from '../controllers/storyEngagement.controller';
import {
  COMMENT_RATE_LIMIT_PER_MIN,
  LIKE_TOGGLE_RATE_LIMIT_PER_MIN,
} from '../services/storyEngagement/storyEngagement.constants';

const router = Router();

const likeToggleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: LIKE_TOGGLE_RATE_LIMIT_PER_MIN,
  message: { success: false, message: 'Too many like toggles', code: 'STORY_LIKE_RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
});

const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: COMMENT_RATE_LIMIT_PER_MIN,
  message: { success: false, message: 'Too many comments', code: 'STORY_COMMENT_RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'anonymous',
});

router.use(authenticate);

router.get('/feed', storyController.getStoryFeed);

router.get(
  '/segments/:sourceType/:sourceId/engagement',
  engagementController.getSegmentEngagement,
);

router.post(
  '/items',
  validate([
    body('mediaUrl').notEmpty().withMessage('mediaUrl is required'),
    body('thumbnailUrl').notEmpty().withMessage('thumbnailUrl is required'),
    body('messageType').isIn(['IMAGE', 'VIDEO']).withMessage('messageType must be IMAGE or VIDEO'),
    body('clientUploadId').optional().isString(),
    body('overlayText').optional().isString(),
    body('caption').optional().isString(),
  ]),
  storyController.createStoryItem
);

router.patch(
  '/items/:id',
  validate([body('caption').optional().isString()]),
  engagementController.patchStoryItemCaption
);

router.delete('/items/:itemId', storyController.deleteStoryItem);

router.post(
  '/views',
  validate([
    body('entries').isArray({ min: 1 }).withMessage('entries must be a non-empty array'),
    body('entries.*.sourceType')
      .isIn(['USER_STORY_ITEM', 'GAME_PHOTO', 'GAME_CREATED', 'GAME_RESULT'])
      .withMessage('Invalid sourceType'),
    body('entries.*.sourceId').notEmpty().withMessage('sourceId is required'),
    body('entries.*.ownerUserId').notEmpty().withMessage('ownerUserId is required'),
  ]),
  storyController.markStoryViews
);

router.get('/segments/:sourceType/:sourceId/likes', engagementController.listSegmentLikers);

router.post(
  '/segments/:sourceType/:sourceId/like/toggle',
  likeToggleLimiter,
  engagementController.toggleSegmentLike
);

router.get('/segments/:sourceType/:sourceId/comments', engagementController.listSegmentComments);

router.post(
  '/segments/:sourceType/:sourceId/comments',
  commentLimiter,
  validate([
    body('body').notEmpty().isString(),
    body('parentId').optional().isString(),
    body('clientMutationId').optional().isString(),
  ]),
  engagementController.createSegmentComment
);

router.get('/comments/:id/replies', engagementController.listCommentReplies);
router.delete('/comments/:id', engagementController.deleteComment);
router.post('/comments/:id/like/toggle', likeToggleLimiter, engagementController.toggleCommentLike);
router.post(
  '/comments/:id/report',
  validate([
    body('reason').optional().isString(),
    body('description').optional().isString(),
  ]),
  engagementController.reportComment
);

export default router;

export const storyMediaRouter = Router();
storyMediaRouter.use(authenticate);
storyMediaRouter.post('/upload/story/image', upload.single('image'), storyController.uploadStoryImage);
storyMediaRouter.post(
  '/upload/story/video',
  uploadChatVideoMulter.fields([
    { name: 'video', maxCount: 1 },
    { name: 'poster', maxCount: 1 },
  ]),
  storyController.uploadStoryVideo
);
