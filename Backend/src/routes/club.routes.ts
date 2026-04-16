import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth';
import * as clubController from '../controllers/club.controller';
import * as clubReviewController from '../controllers/clubReview.controller';

const router = Router();

router.get('/map', optionalAuth, clubController.getClubsForMap);
router.get('/city/:cityId', optionalAuth, clubController.getClubsByCity);

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

