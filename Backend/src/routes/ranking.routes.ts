import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getLeaderboard,
  getLevelLeaderboard,
  getUserRanking,
  getUserStats,
  getUserLeaderboardContext,
} from '../controllers/ranking.controller';

const router = Router();

router.get('/leaderboard', authenticate, getLeaderboard);
router.get('/leaderboard/level', authenticate, getLevelLeaderboard);
router.get('/user/:userId', authenticate, getUserRanking);
router.get('/user/:userId/stats', authenticate, getUserStats);
router.get('/user-context', authenticate, getUserLeaderboardContext);

export default router;

