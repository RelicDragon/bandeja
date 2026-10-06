import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireClubAdmin } from '../middleware/auth';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import * as clubAdminController from '../controllers/clubAdmin.controller';

const router = Router();

const clubAdminMutateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

router.use(authenticate);

router.get('/clubs', clubAdminController.listClubAdminClubs);

router.get(
  '/clubs/:clubId',
  requireClubAdmin('clubId'),
  clubAdminController.getClubAdminClub
);

router.patch(
  '/clubs/:clubId',
  requireClubAdmin('clubId'),
  clubAdminController.patchClubAdminClub
);

router.get(
  '/clubs/:clubId/schedule',
  requireClubAdmin('clubId'),
  clubAdminController.getClubAdminSchedule
);

router.get(
  '/clubs/:clubId/reservations',
  requireClubAdmin('clubId'),
  clubAdminController.listClubAdminReservations
);

router.get(
  '/clubs/:clubId/courts',
  requireClubAdmin('clubId'),
  clubAdminController.listClubAdminCourts
);

router.post(
  '/clubs/:clubId/courts',
  requireClubAdmin('clubId'),
  clubAdminController.createClubAdminCourt
);

router.post(
  '/clubs/:clubId/holds',
  clubAdminMutateLimiter,
  requireClubAdmin('clubId'),
  clubAdminController.createClubAdminHold
);

router.post(
  '/clubs/:clubId/games/:gameId/cancel',
  clubAdminMutateLimiter,
  requireClubAdmin('clubId'),
  clubAdminController.cancelClubAdminGame
);

router.post(
  '/clubs/:clubId/games/:gameId/clear-court',
  clubAdminMutateLimiter,
  requireClubAdmin('clubId'),
  clubAdminController.clearClubAdminGameCourt
);

router.patch('/courts/:courtId', clubAdminController.patchClubAdminCourtWithAuth);
router.patch('/courts/:courtId/deactivate', clubAdminController.deactivateClubAdminCourtWithAuth);

router.patch('/holds/:holdId', clubAdminMutateLimiter, clubAdminController.patchClubAdminHold);
router.delete('/holds/:holdId', clubAdminMutateLimiter, clubAdminController.deleteClubAdminHold);

export default router;
