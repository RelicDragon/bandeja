import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as booktimeMyClubsController from '../controllers/booktimeMyClubs.controller';

const router = Router();

router.get('/my-clubs', authenticate, booktimeMyClubsController.getMyBooktimeClubs);
router.post('/connect-hint/dismiss', authenticate, booktimeMyClubsController.dismissConnectHint);
router.post('/linked-games/batch', authenticate, booktimeMyClubsController.getLinkedGamesBatch);
router.get('/linked-games/:externalBookingId', authenticate, booktimeMyClubsController.getLinkedGames);

export default router;
