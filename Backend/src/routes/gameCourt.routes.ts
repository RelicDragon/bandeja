import { Router } from 'express';
import { authenticate, canEditGame } from '../middleware/auth';
import * as gameCourtController from '../controllers/gameCourt.controller';

const router = Router();

router.get('/game/:gameId', authenticate, gameCourtController.getGameCourts);
router.post('/game/:gameId', authenticate, canEditGame, gameCourtController.setGameCourts);
router.post('/game/:gameId/add', authenticate, canEditGame, gameCourtController.addGameCourt);
router.delete('/game/:gameId/:gameCourtId', authenticate, canEditGame, gameCourtController.removeGameCourt);
router.put('/game/:gameId/reorder', authenticate, canEditGame, gameCourtController.reorderGameCourts);

export default router;

