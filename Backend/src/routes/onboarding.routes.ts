/**
 * PRD 350 — first-run onboarding. Paths live under `/me/onboarding`.
 *
 * Mounted at `/api/users` from `routes/index.ts` **before** `user.routes.ts`, so
 * `user.routes.ts`'s `/:userId/…` routes cannot shadow anything declared here.
 * The flip side: a path declared here wins over the same path in
 * `user.routes.ts` — keep every path under `/me/onboarding` and never declare a
 * bare `/:userId`. Anything this router does not match falls through to
 * `user.routes.ts`.
 *
 * `GET /suggested` is the one exception to the `/me/onboarding` prefix: the PRD
 * names the endpoint `GET /users/suggested`. It is a literal segment, and
 * `user.routes.ts` has no bare `/:userId`, so nothing is shadowed either way.
 *
 * `user.routes.ts` has no global middleware, so add `authenticate` explicitly on
 * every route here.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { ONBOARDING_STEPS } from '../services/onboarding/onboardingSteps';
import * as onboardingController from '../controllers/onboarding.controller';

const router = Router();

/**
 * The step PATCH fires once per step, so a full flow is ~7 writes. The window is
 * sized so a user who restarts the flow a few times is never blocked, while a
 * script hammering the endpoint is.
 */
const onboardingWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'errors.onboarding.rateLimit',
    code: 'onboarding.rateLimit',
  },
});

/** Read paths are cheap but trivially hammerable from the client. */
const onboardingReadLimiter = rateLimit({
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

router.get(
  '/me/onboarding',
  onboardingReadLimiter,
  authenticate,
  onboardingController.getOnboarding,
);

router.patch(
  '/me/onboarding',
  onboardingWriteLimiter,
  authenticate,
  validate([
    body('step')
      .isString()
      .bail()
      .isIn([...ONBOARDING_STEPS])
      .withMessage('errors.onboarding.invalidStep'),
  ]),
  onboardingController.patchOnboardingStep,
);

router.post(
  '/me/onboarding/complete',
  onboardingWriteLimiter,
  authenticate,
  onboardingController.postOnboardingComplete,
);

router.get(
  '/suggested',
  onboardingReadLimiter,
  authenticate,
  onboardingController.getSuggestedPlayers,
);

export default router;
