import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authenticate, requireClubAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
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
  validate([
    body('name').notEmpty().withMessage('Name is required'),
  ]),
  clubAdminController.createClubAdminCourt
);

router.post(
  '/clubs/:clubId/holds',
  clubAdminMutateLimiter,
  requireClubAdmin('clubId'),
  validate([
    body('courtId').notEmpty(),
    body('startTime').notEmpty(),
    body('endTime').notEmpty(),
    body('label').notEmpty(),
  ]),
  clubAdminController.createClubAdminHold
);

router.post(
  '/clubs/:clubId/games/:gameId/cancel',
  clubAdminMutateLimiter,
  requireClubAdmin('clubId'),
  validate([body('reason').notEmpty()]),
  clubAdminController.cancelClubAdminGame
);

router.post(
  '/clubs/:clubId/games/:gameId/clear-court',
  clubAdminMutateLimiter,
  requireClubAdmin('clubId'),
  validate([body('reason').notEmpty()]),
  clubAdminController.clearClubAdminGameCourt
);

router.patch('/courts/:courtId', clubAdminController.patchClubAdminCourtWithAuth);
router.patch('/courts/:courtId/deactivate', clubAdminController.deactivateClubAdminCourtWithAuth);

router.patch('/holds/:holdId', clubAdminController.patchClubAdminHold);
router.delete('/holds/:holdId', clubAdminController.deleteClubAdminHold);

export default router;
