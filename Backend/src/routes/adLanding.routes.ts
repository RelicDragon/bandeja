import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as adLandingWishController from '../controllers/adLandingWish.controller';

const router = Router();

const wishSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many wishes from this IP, please try again later.',
    code: 'ads.landing.wishRateLimit',
  },
});

router.get('/:landingKey/wishes', adLandingWishController.getAdLandingWishes);

router.post(
  '/:landingKey/wishes',
  wishSubmitLimiter,
  adLandingWishController.postAdLandingWish
);

export default router;
