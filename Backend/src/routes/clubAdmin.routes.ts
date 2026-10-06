import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { clubAdminContext, clubAdminContextFrom, requireCapability } from '../middleware/clubAdminContext';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import prisma from '../config/database';
import * as c from '../controllers/clubAdmin.controller';
import * as billing from '../controllers/clubAdminBilling.controller';
import * as reports from '../controllers/clubAdminReports.controller';

/**
 * Club admin console (docs/domains/club-admin.md). Every club route resolves the caller's club
 * role once (`clubAdminContext`) and checks a capability (`requireCapability`) — STAFF limits are
 * enforced here, on the legacy routes shipped builds call as well as on the v2 ones.
 */
const router = Router();

const clubAdminMutateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
});

const club = clubAdminContext('clubId');
const can = requireCapability;

const courtClub = clubAdminContextFrom(async (req) => {
  const court = await prisma.court.findUnique({ where: { id: req.params.courtId }, select: { clubId: true } });
  return court?.clubId ?? null;
});
const holdClub = clubAdminContextFrom(async (req) => {
  const hold = await prisma.courtSlotHold.findFirst({
    where: { id: req.params.holdId, deletedAt: null },
    select: { clubId: true },
  });
  return hold?.clubId ?? null;
});

router.use(authenticate);

router.get('/clubs', c.listClubAdminClubs);

/* --- club ------------------------------------------------------------------------------------ */
router.get('/clubs/:clubId', club, can('schedule.view'), c.getClubAdminClub);
router.patch('/clubs/:clubId', club, can('club.edit'), c.patchClubAdminClub);
router.get('/clubs/:clubId/context', club, c.getContext);
router.get('/clubs/:clubId/dashboard', club, can('schedule.view'), c.getDashboard);
router.get('/clubs/:clubId/profile', club, can('schedule.view'), c.getProfile);
router.patch('/clubs/:clubId/profile', clubAdminMutateLimiter, club, can('club.edit'), c.patchProfile);
router.get('/clubs/:clubId/hours', club, can('schedule.view'), c.getHours);
router.put('/clubs/:clubId/hours', clubAdminMutateLimiter, club, can('club.edit'), c.putHours);

/* --- schedule & bookings --------------------------------------------------------------------- */
router.get('/clubs/:clubId/schedule', club, can('schedule.view'), c.getClubAdminSchedule);
router.get('/clubs/:clubId/reservations', club, can('bookings.view'), c.listClubAdminReservations);
router.get('/clubs/:clubId/bookings', club, can('bookings.view'), c.getBookings);

/* --- courts ---------------------------------------------------------------------------------- */
router.get('/clubs/:clubId/courts', club, can('schedule.view'), c.listClubAdminCourts);
router.post('/clubs/:clubId/courts', clubAdminMutateLimiter, club, can('courts.edit'), c.createClubAdminCourt);
router.post('/clubs/:clubId/courts/reorder', clubAdminMutateLimiter, club, can('courts.edit'), c.reorderCourts);
router.get('/clubs/:clubId/courts/:courtId/impact', club, can('courts.edit'), c.getCourtImpact);
router.patch('/clubs/:clubId/courts/:courtId', clubAdminMutateLimiter, club, can('courts.edit'), c.patchClubAdminCourt);

/* --- holds ----------------------------------------------------------------------------------- */
router.post('/clubs/:clubId/holds', clubAdminMutateLimiter, club, can('schedule.edit'), c.createClubAdminHold);
router.patch('/clubs/:clubId/holds/:holdId', clubAdminMutateLimiter, club, can('schedule.edit'), c.patchHoldV2);
router.delete('/clubs/:clubId/holds/:holdId', clubAdminMutateLimiter, club, can('schedule.edit'), c.deleteClubAdminHold);

/* --- pricing & billing ----------------------------------------------------------------------- */
router.get('/clubs/:clubId/pricing', club, can('bookings.view'), billing.getPricing);
router.put('/clubs/:clubId/pricing', clubAdminMutateLimiter, club, can('billing.configure'), billing.putPricing);
router.get('/clubs/:clubId/pricing/quote', club, can('bookings.view'), billing.getQuote);
router.post('/clubs/:clubId/charges', clubAdminMutateLimiter, club, can('billing.collect'), billing.postCharge);
router.get('/clubs/:clubId/charges/:chargeId', club, can('bookings.view'), billing.getChargeById);
router.patch('/clubs/:clubId/charges/:chargeId', clubAdminMutateLimiter, club, can('billing.collect'), billing.patchChargeById);
router.post('/clubs/:clubId/charges/:chargeId/payments', clubAdminMutateLimiter, club, can('billing.collect'), billing.postPayment);
router.delete(
  '/clubs/:clubId/charges/:chargeId/payments/:paymentId',
  clubAdminMutateLimiter,
  club,
  can('billing.collect'),
  billing.deletePayment
);
router.get('/clubs/:clubId/payments', club, can('billing.collect'), billing.getPayments);

/* --- reports, activity, reviews -------------------------------------------------------------- */
router.get('/clubs/:clubId/reports', club, can('reports.view'), reports.getReport);
router.get('/clubs/:clubId/reports/export.csv', clubAdminMutateLimiter, club, can('reports.view'), reports.exportReportCsv);
router.get('/clubs/:clubId/activity', club, can('activity.view'), reports.getActivity);
router.get('/clubs/:clubId/reviews', club, can('reviews.view'), reports.getReviews);

/* --- games ----------------------------------------------------------------------------------- */
router.post('/clubs/:clubId/games/:gameId/cancel', clubAdminMutateLimiter, club, can('schedule.edit'), c.cancelClubAdminGame);
router.post('/clubs/:clubId/games/:gameId/clear-court', clubAdminMutateLimiter, club, can('schedule.edit'), c.clearClubAdminGameCourt);

/* --- team ------------------------------------------------------------------------------------ */
router.get('/clubs/:clubId/team', club, can('team.manage'), c.getTeam);
router.post('/clubs/:clubId/team', clubAdminMutateLimiter, club, can('team.manage'), c.postTeam);
router.patch('/clubs/:clubId/team/:userId', clubAdminMutateLimiter, club, can('team.manage'), c.patchTeam);
router.delete('/clubs/:clubId/team/:userId', clubAdminMutateLimiter, club, can('team.manage'), c.deleteTeam);

/* --- legacy row-keyed routes (shipped builds) ------------------------------------------------ */
router.patch('/courts/:courtId', clubAdminMutateLimiter, courtClub, can('courts.edit'), c.patchClubAdminCourt);
router.patch('/courts/:courtId/deactivate', clubAdminMutateLimiter, courtClub, can('courts.edit'), c.deactivateClubAdminCourt);
router.patch('/holds/:holdId', clubAdminMutateLimiter, holdClub, can('schedule.edit'), c.patchClubAdminHold);
router.delete('/holds/:holdId', clubAdminMutateLimiter, holdClub, can('schedule.edit'), c.deleteClubAdminHold);

export default router;
