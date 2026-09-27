import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, canEditGame } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { AuthRequest } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { canReadGameFaq } from '../services/faq/faqReadAccess';
import {
  getGameFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
  getFaqTranslationStatus,
  submitFaqTranslations,
  retryFaqTranslations,
  requestReaderFaqTranslation,
} from '../controllers/faq.controller';

const router = Router();

router.use(authenticate);

const translationWriteLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  message: { success: false, message: 'Too many FAQ translation requests. Try again shortly.' },
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `${(req as AuthRequest).userId ?? rateLimitKeyFromRequest(req)}:${req.params.gameId}`,
});

router.get(
  '/game/:gameId',
  validate([param('gameId').notEmpty().withMessage('Game ID is required')]),
  canReadGameFaq,
  getGameFaqs
);

router.get('/game/:gameId/translations', canReadGameFaq, getFaqTranslationStatus);
router.post('/game/:gameId/translations/request', canReadGameFaq, translationWriteLimiter, requestReaderFaqTranslation);
router.post('/game/:gameId/translations', canEditGame, translationWriteLimiter, submitFaqTranslations);
router.post('/game/:gameId/translations/retry', canEditGame, translationWriteLimiter, retryFaqTranslations);

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
