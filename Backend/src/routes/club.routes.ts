import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as clubController from '../controllers/club.controller';
import * as clubReviewController from '../controllers/clubReview.controller';
import * as booktimeAuthController from '../controllers/booktimeAuth.controller';
import * as booktimeMyClubsController from '../controllers/booktimeMyClubs.controller';
import * as booktimeSnapshotController from '../controllers/booktimeSnapshot.controller';

const router = Router();

const booktimeSessionTokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many session token requests' },
  keyGenerator: (req) => (req as AuthRequest).userId ?? rateLimitKeyFromRequest(req),
});

router.get('/map', optionalAuth, clubController.getClubsForMap);
router.get('/city/:cityId', optionalAuth, clubController.getClubsByCity);

router.get('/:clubId/booktime/auth', authenticate, booktimeAuthController.getBooktimeAuth);
router.put(
  '/:clubId/booktime/auth',
  authenticate,
  validate([
    body('accessToken').isString().notEmpty().withMessage('accessToken is required'),
    body('refreshToken').isString().notEmpty().withMessage('refreshToken is required'),
    body('externalUserId').isString().notEmpty().withMessage('externalUserId is required'),
    body('phoneNumber').optional().isString(),
    body('expiresAt').optional().isISO8601(),
  ]),
  booktimeAuthController.putBooktimeAuth
);
router.post(
  '/:clubId/booktime/session-token',
  authenticate,
  booktimeSessionTokenLimiter,
  booktimeAuthController.postBooktimeSessionToken
);
router.delete('/:clubId/booktime/auth', authenticate, booktimeAuthController.deleteBooktimeAuth);
router.patch(
  '/:clubId/booktime/auth/scout-opt-in',
  authenticate,
  validate([body('scoutOptIn').isBoolean().withMessage('scoutOptIn must be a boolean')]),
  booktimeMyClubsController.patchScoutOptIn
);

router.get('/:clubId/booktime/scout-token', authenticate, booktimeAuthController.getBooktimeScoutToken);
router.post(
  '/:clubId/booktime/scout-token/invalidate',
  authenticate,
  validate([body('authId').isString().notEmpty().withMessage('authId is required')]),
  booktimeAuthController.invalidateBooktimeScoutToken
);

router.get('/:clubId/booktime/snapshot', authenticate, booktimeSnapshotController.getBooktimeSnapshot);
router.put(
  '/:clubId/booktime/snapshot',
  authenticate,
  validate([
    body('date').isString().notEmpty().withMessage('date is required'),
    body('fetchedAt').isISO8601().withMessage('fetchedAt must be ISO8601'),
    body('force').optional().isBoolean(),
    body('courts').isArray().withMessage('courts must be an array'),
  ]),
  booktimeSnapshotController.putBooktimeSnapshot
);

router.get('/:id/reviews', optionalAuth, clubReviewController.getClubReviews);
router.get('/:id/review-eligible-games', authenticate, clubReviewController.getEligibleGames);
router.get('/:id/my-review', authenticate, clubReviewController.getMyClubReview);
router.post(
  '/:id/reviews',
  authenticate,
  validate([
    body('gameId').notEmpty().withMessage('Game ID is required'),
    body('stars').isInt({ min: 1, max: 5 }).withMessage('Stars must be between 1 and 5'),
    body('text').optional().isString().isLength({ max: 1000 }).withMessage('Text must be at most 1000 characters'),
    body('photos').optional().isArray(),
  ]),
  clubReviewController.submitClubReview
);

router.get('/:id', optionalAuth, clubController.getClubById);

router.post(
  '/',
  requireAdmin,
  validate([
    body('name').notEmpty().withMessage('Name is required'),
    body('address').notEmpty().withMessage('Address is required'),
    body('cityId').notEmpty().withMessage('City ID is required'),
  ]),
  clubController.createClub
);

router.put('/:id', requireAdmin, clubController.updateClub);

export default router;

