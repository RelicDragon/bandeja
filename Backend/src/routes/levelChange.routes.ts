import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as levelChangeController from '../controllers/levelChange.controller';

const router = Router();

router.use(authenticate);

router.get('/', levelChangeController.getUserLevelChanges);
router.get('/:userId', levelChangeController.getUserLevelChangesByUserId);

export default router;

