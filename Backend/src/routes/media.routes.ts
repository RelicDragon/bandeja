import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { body } from 'express-validator';
import { 
  uploadAvatar, 
  uploadChatImage, 
  uploadChatDocument, 
  uploadGameMedia, 
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
  '/upload/chat/image',
  upload.single('image'),
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required')
  ]),
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
  '/upload/game/media',
  upload.single('image'),
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required')
  ]),
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
