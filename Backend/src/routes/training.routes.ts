import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as trainingController from '../controllers/training.controller';

const router = Router();

router.post(
  '/:gameId/finish',
  authenticate,
  trainingController.finishTraining
);

router.post(
  '/:gameId/participant/:userId/level',
  authenticate,
  validate([
    body('level').isFloat({ min: 1.0, max: 7.0 }).withMessage('Level must be between 1.0 and 7.0'),
    body('reliability').isFloat({ min: 0, max: 100 }).withMessage('Reliability must be between 0 and 100'),
  ]),
  trainingController.updateParticipantLevel
);

router.post(
  '/:gameId/undo',
  authenticate,
  trainingController.undoTraining
);

router.post(
  '/:gameId/review',
  authenticate,
  validate([
    body('stars').isInt({ min: 1, max: 5 }).withMessage('Stars must be between 1 and 5'),
    body('text').optional().isString().isLength({ max: 1000 }).withMessage('Text must be at most 1000 characters'),
  ]),
  trainingController.submitReview
);

router.get(
  '/:gameId/my-review',
  authenticate,
  trainingController.getMyReview
);

export default router;
