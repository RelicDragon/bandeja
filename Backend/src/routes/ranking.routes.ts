import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getUserLeaderboardContext,
} from '../controllers/ranking.controller';

const router = Router();

router.get('/user-context', authenticate, getUserLeaderboardContext);

export default router;

