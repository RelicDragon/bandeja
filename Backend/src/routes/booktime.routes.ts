import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as booktimeMyClubsController from '../controllers/booktimeMyClubs.controller';

const router = Router();

router.get('/my-clubs', authenticate, booktimeMyClubsController.getMyBooktimeClubs);
router.get('/linked-game/:externalBookingId', authenticate, booktimeMyClubsController.getLinkedGame);

export default router;
