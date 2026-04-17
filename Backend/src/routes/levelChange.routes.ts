import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import * as levelChangeController from '../controllers/levelChange.controller';

const router = Router();

router.get('/game/:gameId', authenticate, levelChangeController.getGameLevelChanges);
router.get('/:userId', optionalAuth, levelChangeController.getUserLevelChangesByUserId);
router.get('/', authenticate, levelChangeController.getUserLevelChanges);

export default router;
