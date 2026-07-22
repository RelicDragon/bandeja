import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as klikterenMyClubsController from '../controllers/klikterenMyClubs.controller';

const router = Router();

router.get('/my-clubs', authenticate, klikterenMyClubsController.getMyKlikterenClubs);
router.get('/linked-games/:externalBookingId', authenticate, klikterenMyClubsController.getLinkedGames);

export default router;
