import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as gameCourtController from '../controllers/gameCourt.controller';

const router = Router();

router.get('/game/:gameId', authenticate, gameCourtController.getGameCourts);
router.post('/game/:gameId', authenticate, gameCourtController.setGameCourts);
router.post('/game/:gameId/add', authenticate, gameCourtController.addGameCourt);
router.delete('/game/:gameId/:gameCourtId', authenticate, gameCourtController.removeGameCourt);
router.put('/game/:gameId/reorder', authenticate, gameCourtController.reorderGameCourts);

export default router;

