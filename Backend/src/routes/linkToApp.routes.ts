import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as linkToAppController from '../controllers/linkToApp.controller';

const router = Router();

const linkToAppLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'linkToApp.rateLimit',
  },
});

router.get('/hit', linkToAppLimiter, linkToAppController.hitLinkToApp);
router.get('/go/:choice', linkToAppLimiter, linkToAppController.goLinkToApp);

export default router;
