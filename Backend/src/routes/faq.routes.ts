import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, canEditGame } from '../middleware/auth';
import {
  getGameFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
} from '../controllers/faq.controller';

const router = Router();

router.use(authenticate);

router.get(
  '/game/:gameId',
  validate([param('gameId').notEmpty().withMessage('Game ID is required')]),
  getGameFaqs
);

router.post(
  '/',
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required'),
    body('question').notEmpty().withMessage('Question is required'),
    body('answer').notEmpty().withMessage('Answer is required'),
    body('order').optional().isInt().withMessage('Order must be an integer'),
  ]),
  canEditGame,
  createFaq
);

router.put(
  '/:id',
  validate([
    param('id').notEmpty().withMessage('FAQ ID is required'),
    body('question').optional().notEmpty().withMessage('Question cannot be empty'),
    body('answer').optional().notEmpty().withMessage('Answer cannot be empty'),
    body('order').optional().isInt().withMessage('Order must be an integer'),
  ]),
  updateFaq
);

router.delete(
  '/:id',
  validate([param('id').notEmpty().withMessage('FAQ ID is required')]),
  deleteFaq
);

router.put(
  '/game/:gameId/reorder',
  validate([
    param('gameId').notEmpty().withMessage('Game ID is required'),
    body('faqIds').isArray().withMessage('faqIds must be an array'),
    body('faqIds.*').isString().withMessage('Each FAQ ID must be a string'),
  ]),
  canEditGame,
  reorderFaqs
);

export default router;

