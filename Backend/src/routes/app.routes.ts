import { Router } from 'express';
import * as appController from '../controllers/app.controller';
import { optionalAuth } from '../middleware/auth';

const router = Router();

router.get('/location', optionalAuth, appController.getLocation);
router.get('/version-check', appController.checkVersion);

export default router;
