import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getUserLeaderboardContext,
} from '../controllers/ranking.controller';
import { getAchievementLeaderboard } from '../controllers/ranking/achievementLeaderboard.controller';

const router = Router();

router.get('/user-context', authenticate, getUserLeaderboardContext);
router.get('/achievement-context', authenticate, getAchievementLeaderboard);

export default router;
