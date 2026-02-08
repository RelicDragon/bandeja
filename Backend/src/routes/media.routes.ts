import { Router } from 'express';
import { authenticate, canEditGame, canAccessGame } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { body } from 'express-validator';
import { 
  uploadAvatar, 
  uploadGameAvatar,
  uploadGroupChannelAvatar,
  uploadChatImage, 
  uploadChatDocument, 
  uploadGameMedia, 
  uploadMarketItemImage,
  deleteFile,
  upload,
  uploadAvatarFiles
} from '../controllers/media.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/upload/avatar',
  uploadAvatarFiles,
  uploadAvatar
);

router.post(
  '/upload/game/avatar',
  uploadAvatarFiles,
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required')
  ]),
  canEditGame,
  uploadGameAvatar
);

router.post(
  '/upload/group-channel/avatar',
  uploadAvatarFiles,
  validate([
    body('groupChannelId').notEmpty().withMessage('Group channel ID is required')
  ]),
  uploadGroupChannelAvatar
);

router.post(
  '/upload/chat/image',
  upload.single('image'),
  uploadChatImage
);

router.post(
  '/upload/chat/document',
  upload.single('document'),
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required')
  ]),
  uploadChatDocument
);

router.post(
  '/upload/market-item/image',
  upload.single('image'),
  uploadMarketItemImage
);

router.post(
  '/upload/game/media',
  upload.single('image'),
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required')
  ]),
  canAccessGame,
  uploadGameMedia
);

router.delete(
  '/file',
  validate([
    body('filePath').notEmpty().withMessage('File path is required')
  ]),
  deleteFile
);

export default router;
