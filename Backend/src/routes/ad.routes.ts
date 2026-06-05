import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as adController from '../controllers/ad.controller';

const router = Router();

router.use(authenticate);

router.get('/placements', adController.getAdPlacements);
router.post('/events', adController.postAdEvents);

export default router;
