import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as padelooMyClubsController from '../controllers/padelooMyClubs.controller';

const router = Router();

router.get('/my-clubs', authenticate, padelooMyClubsController.getMyPadelooClubs);
router.get('/linked-games/:externalBookingId', authenticate, padelooMyClubsController.getLinkedGames);

export default router;
