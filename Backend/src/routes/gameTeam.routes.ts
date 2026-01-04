import { Router } from 'express';
import * as gameTeamController from '../controllers/gameTeam.controller';
import { authenticate, canEditGame } from '../middleware/auth';

const router = Router();

router.post('/game/:gameId/teams', authenticate, canEditGame, gameTeamController.setGameTeams);
router.get('/game/:gameId/teams', gameTeamController.getGameTeams);
router.delete('/game/:gameId/teams', authenticate, canEditGame, gameTeamController.deleteGameTeams);

export default router;

