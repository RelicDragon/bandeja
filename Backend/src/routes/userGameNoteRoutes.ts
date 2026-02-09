import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as userGameNoteController from '../controllers/userGameNoteController';

const router = Router();

router.get('/:gameId', authenticate, userGameNoteController.getNote);

router.post(
  '/:gameId',
  authenticate,
  validate([
    body('content').notEmpty().withMessage('Content is required'),
    body('content').isLength({ max: 5000 }).withMessage('Content must not exceed 5000 characters'),
  ]),
  userGameNoteController.createNote
);

router.put(
  '/:gameId',
  authenticate,
  validate([
    body('content').notEmpty().withMessage('Content is required'),
    body('content').isLength({ max: 5000 }).withMessage('Content must not exceed 5000 characters'),
  ]),
  userGameNoteController.updateNote
);

router.delete('/:gameId', authenticate, userGameNoteController.deleteNote);

router.patch(
  '/:gameId',
  authenticate,
  validate([
    body('content').notEmpty().withMessage('Content is required'),
    body('content').isLength({ max: 5000 }).withMessage('Content must not exceed 5000 characters'),
  ]),
  userGameNoteController.upsertNote
);

export default router;
