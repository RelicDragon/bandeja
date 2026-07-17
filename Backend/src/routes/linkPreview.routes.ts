import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as linkPreviewController from '../controllers/linkPreview.controller';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { AuthRequest } from '../middleware/auth';

const router = Router();
const imageLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});
const mediaLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as AuthRequest).userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
});

router.get('/image', imageLimiter, linkPreviewController.getLinkPreviewImage);
router.get('/media', authenticate, mediaLimiter, linkPreviewController.getLinkPreviewMedia);
router.get('/', authenticate, linkPreviewController.getLinkPreview);

export default router;
