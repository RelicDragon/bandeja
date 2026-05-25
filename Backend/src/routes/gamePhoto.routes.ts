import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../controllers/media.controller';
import * as gamePhotoController from '../controllers/gamePhoto.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post(
  '/',
  upload.single('image'),
  gamePhotoController.uploadGamePhoto
);

router.get(
  '/',
  validate([
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1-50'),
    query('cursor').optional().isString(),
  ]),
  gamePhotoController.listGamePhotos
);

router.patch(
  '/main',
  validate([
    body('photoId').optional({ nullable: true }).isString().withMessage('photoId must be a string'),
  ]),
  gamePhotoController.setMainGamePhoto
);

router.delete('/:photoId', gamePhotoController.deleteGamePhoto);

export default router;
