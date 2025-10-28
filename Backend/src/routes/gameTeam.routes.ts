import { Router } from 'express';
import * as gameTeamController from '../controllers/gameTeam.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/game/:gameId/teams', authenticate, gameTeamController.setGameTeams);
router.get('/game/:gameId/teams', gameTeamController.getGameTeams);
router.delete('/game/:gameId/teams', authenticate, gameTeamController.deleteGameTeams);

export default router;

