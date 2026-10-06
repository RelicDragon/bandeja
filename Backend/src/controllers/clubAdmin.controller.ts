import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ClubAdminRequest, getClubAdminContext } from '../middleware/clubAdminContext';
import { ClubAdminClubService } from '../services/clubAdmin/clubAdminClub.service';
import { ClubAdminScheduleService } from '../services/clubAdmin/clubAdminSchedule.service';
import { ClubAdminReservationsService } from '../services/clubAdmin/clubAdminReservations.service';
import { ClubAdminCourtService } from '../services/clubAdmin/clubAdminCourt.service';
import { ClubAdminHoldService, HoldActor, parseHoldDeleteScope } from '../services/clubAdmin/clubAdminHold.service';
import { ClubAdminGameService, type ClubAdminGameActionBody } from '../services/clubAdmin/clubAdminGame.service';
import { clubAdminValidation, parseIntParam } from '../services/clubAdmin/clubAdminErrors';
import { getClubAdminContextPayload } from '../services/clubAdmin/clubAdminContext.service';
import { getClubDashboard } from '../services/clubAdmin/clubAdminDashboard.service';
import { listBookings, parseBookingsQuery } from '../services/clubAdmin/clubAdminBookings.service';
import { getClubHours, parseHoursBody, putClubHours } from '../services/clubAdmin/clubAdminHours.service';
import { getClubProfile, patchClubProfile } from '../services/clubAdmin/clubAdminProfile.service';
import { addTeamMember, changeTeamRole, listTeam, removeTeamMember } from '../services/clubAdmin/clubAdminTeam.service';
import { logClubActivity } from '../services/clubAdmin/clubAdminActivity.service';
import { clubAdminCan } from '@bandeja/shared/clubAdmin/contract';

function body(req: AuthRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

function holdActor(req: ClubAdminRequest): HoldActor {
  const ctx = getClubAdminContext(req);
  return { userId: req.userId!, clubId: ctx.clubId, timezone: ctx.timezone };
}

function parseGameActionBody(raw: unknown): ClubAdminGameActionBody {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (typeof b.reason !== 'string' || !b.reason.trim()) throw clubAdminValidation('reason', 'is required');
  for (const key of ['note', 'message'] as const) {
    if (b[key] !== undefined && b[key] !== null && typeof b[key] !== 'string') {
      throw clubAdminValidation(key, 'must be a string');
    }
  }
  if (b.notifyHost !== undefined && typeof b.notifyHost !== 'boolean') {
    throw clubAdminValidation('notifyHost', 'must be a boolean');
  }
  return {
    reason: b.reason.trim().slice(0, 200),
    note: typeof b.note === 'string' ? b.note.slice(0, 500) : null,
    message: typeof b.message === 'string' ? b.message : null,
    notifyHost: b.notifyHost as boolean | undefined,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Legacy endpoints (shipped builds): shapes unchanged, fields only added.
 * ------------------------------------------------------------------------------------------- */

export const listClubAdminClubs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseIntParam(req.query.limit, 'limit', { fallback: 20, min: 1, max: 50 });
  const offset = parseIntParam(req.query.offset, 'offset', { fallback: 0, min: 0, max: 100_000 });
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q : undefined;
  const data = await ClubAdminClubService.listClubs(req.userId!, limit, offset, q);
  res.json({ success: true, data });
});

export const getClubAdminClub = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const ctx = getClubAdminContext(req);
  const club = await ClubAdminClubService.getClub(req.userId!, ctx.clubId);
  // Provider configuration is for people who can edit the club; STAFF gets the rest of the row.
  if (!clubAdminCan(ctx.role, 'club.edit')) {
    res.json({ success: true, data: { ...club, integrationConfig: null, ptMeta: null } });
    return;
  }
  res.json({ success: true, data: club });
});

export const patchClubAdminClub = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminClubService.patchClub(req.userId!, getClubAdminContext(req).clubId, body(req));
  res.json({ success: true, data });
});

export const listClubAdminReservations = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const limit = parseIntParam(req.query.limit, 'limit', { fallback: 20, min: 1, max: 50 });
  const offset = parseIntParam(req.query.offset, 'offset', { fallback: 0, min: 0, max: 100_000 });
  const data = await ClubAdminReservationsService.listReservations(getClubAdminContext(req).clubId, limit, offset);
  res.json({ success: true, data });
});

export const getClubAdminSchedule = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  // Absent → club-local today (never the server's UTC date); malformed → 400.
  const date = req.query.date === undefined || req.query.date === '' ? undefined : req.query.date;
  if (date !== undefined && typeof date !== 'string') throw clubAdminValidation('date', 'must be yyyy-MM-dd');
  const courtId = typeof req.query.courtId === 'string' && req.query.courtId ? req.query.courtId : undefined;
  const data = await ClubAdminScheduleService.buildDaySchedule(getClubAdminContext(req).clubId, date, courtId);
  res.json({ success: true, data });
});

export const listClubAdminCourts = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminCourtService.listCourts(req.userId!, getClubAdminContext(req).clubId);
  res.json({ success: true, data });
});

export const createClubAdminCourt = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminCourtService.createCourt(req.userId!, getClubAdminContext(req).clubId, body(req));
  res.status(201).json({ success: true, data });
});

export const createClubAdminHold = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminHoldService.createHold(holdActor(req), body(req));
  res.status(201).json({ success: true, data });
});

/** Legacy `PATCH /holds/:holdId`: no overlap check (shipped builds never send `force`). */
export const patchClubAdminHold = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminHoldService.updateHold(holdActor(req), req.params.holdId, body(req), { checkOverlap: false });
  res.json({ success: true, data });
});

export const deleteClubAdminHold = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminHoldService.deleteHold(holdActor(req), req.params.holdId, parseHoldDeleteScope(req.query.scope));
  res.json({ success: true, data });
});

export const cancelClubAdminGame = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminGameService.cancelGame(
    req.userId!,
    getClubAdminContext(req).clubId,
    req.params.gameId,
    parseGameActionBody(req.body)
  );
  res.json({ success: true, data });
});

export const clearClubAdminGameCourt = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminGameService.clearCourtSlot(
    req.userId!,
    getClubAdminContext(req).clubId,
    req.params.gameId,
    parseGameActionBody(req.body)
  );
  res.json({ success: true, data });
});

export const patchClubAdminCourt = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const ctx = getClubAdminContext(req);
  const data = await ClubAdminCourtService.patchCourt(req.userId!, req.params.courtId, body(req), ctx.clubId);
  res.json({ success: true, data });
});

export const deactivateClubAdminCourt = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const ctx = getClubAdminContext(req);
  const data = await ClubAdminCourtService.patchCourt(req.userId!, req.params.courtId, { isActive: false }, ctx.clubId);
  res.json({ success: true, data });
});

/* ---------------------------------------------------------------------------------------------
 * Console v2 (`Frontend/shared/clubAdmin/contract.ts`).
 * ------------------------------------------------------------------------------------------- */

export const getContext = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await getClubAdminContextPayload(getClubAdminContext(req)) });
});

export const getDashboard = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await getClubDashboard(getClubAdminContext(req)) });
});

export const getBookings = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const ctx = getClubAdminContext(req);
  const params = parseBookingsQuery(req.query as Record<string, unknown>);
  const data = await listBookings(
    { clubId: ctx.clubId, timezone: ctx.timezone, currency: ctx.currency, integrationType: ctx.club.integrationType },
    params
  );
  res.json({ success: true, data });
});

export const patchHoldV2 = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const data = await ClubAdminHoldService.updateHold(holdActor(req), req.params.holdId, body(req), { checkOverlap: true });
  res.json({ success: true, data });
});

export const getHours = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const ctx = getClubAdminContext(req);
  res.json({ success: true, data: await getClubHours(ctx.clubId, ctx.timezone) });
});

export const putHours = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  const ctx = getClubAdminContext(req);
  const parsed = parseHoursBody(req.body);
  const data = await putClubHours(ctx.clubId, ctx.timezone, parsed);
  await logClubActivity(ctx.clubId, req.userId!, 'HOURS_UPDATED', { closures: parsed.closures.length });
  res.json({ success: true, data });
});

export const getProfile = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await getClubProfile(getClubAdminContext(req).clubId) });
});

export const patchProfile = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await patchClubProfile(req.userId!, getClubAdminContext(req).clubId, body(req)) });
});

export const reorderCourts = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await ClubAdminCourtService.reorderCourts(req.userId!, getClubAdminContext(req).clubId, body(req)) });
});

export const getCourtImpact = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await ClubAdminCourtService.getCourtImpact(getClubAdminContext(req).clubId, req.params.courtId) });
});

export const getTeam = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await listTeam(getClubAdminContext(req).clubId, req.userId!) });
});

export const postTeam = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.status(201).json({ success: true, data: await addTeamMember(req.userId!, getClubAdminContext(req).clubId, body(req)) });
});

export const patchTeam = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({
    success: true,
    data: await changeTeamRole(req.userId!, getClubAdminContext(req).clubId, req.params.userId, body(req)),
  });
});

export const deleteTeam = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await removeTeamMember(req.userId!, getClubAdminContext(req).clubId, req.params.userId) });
});
