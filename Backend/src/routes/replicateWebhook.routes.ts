import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handleReplicateWebhook } from '../controllers/replicateWebhook.controller';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';

const router = Router();

const replicateWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

router.post('/replicate', replicateWebhookLimiter, handleReplicateWebhook);

export default router;
