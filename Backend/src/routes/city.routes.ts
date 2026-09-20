import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as cityController from '../controllers/city.controller';
import * as onboardingController from '../controllers/onboarding.controller';

const router = Router();

/** PRD 350 — unauthenticated-reachable, so rate-limited per client key. */
const cityStatsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'errors.onboarding.rateLimit',
    code: 'onboarding.rateLimit',
  },
});

router.get('/meta/countries', cityController.getCountries);

router.get('/meta/timezones', cityController.getTimezones);

router.get('/', optionalAuth, cityController.getAllCities);

router.get('/:id', optionalAuth, cityController.getCityById);

/**
 * PRD 350 — player count behind the onboarding Welcome step's social proof
 * line. Express matches on the full path, so the extra `/stats` segment can
 * never be swallowed by `/:id` above. The handler lives in
 * `controllers/onboarding.controller.ts` with the rest of the PRD 350 surface,
 * and the count is cached for an hour in `services/onboarding/cityStats.service.ts`.
 */
router.get('/:id/stats', optionalAuth, cityStatsLimiter, onboardingController.getCityStatsPublic);

router.post(
  '/',
  validate([
    body('name').notEmpty().withMessage('City name is required'),
    body('country').notEmpty().withMessage('Country is required'),
    body('timezone').optional(),
  ]),
  cityController.createCity
);

export default router;

