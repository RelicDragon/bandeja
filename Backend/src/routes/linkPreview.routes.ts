import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as linkPreviewController from '../controllers/linkPreview.controller';

const router = Router();

router.get('/', authenticate, linkPreviewController.getLinkPreview);

export default router;
