import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ClubAdminService } from '../services/clubAdmin/clubAdmin.service';
import { ClubAdminClubService } from '../services/clubAdmin/clubAdminClub.service';
import { ClubAdminScheduleService } from '../services/clubAdmin/clubAdminSchedule.service';
import { ClubAdminReservationsService } from '../services/clubAdmin/clubAdminReservations.service';
import { ClubAdminCourtService } from '../services/clubAdmin/clubAdminCourt.service';
import { ClubAdminHoldService } from '../services/clubAdmin/clubAdminHold.service';
import { ClubAdminGameService } from '../services/clubAdmin/clubAdminGame.service';
import prisma from '../config/database';
import { clubAdminNotFound, clubAdminValidation, parseIntParam } from '../services/clubAdmin/clubAdminErrors';
import type { ClubAdminGameActionBody } from '../services/clubAdmin/clubAdminGame.service';

async function assertHoldClubAdmin(userId: string, holdId: string): Promise<string> {
  const hold = await prisma.courtSlotHold.findUnique({
    where: { id: holdId },
    select: { clubId: true },
  });
  if (!hold) throw clubAdminNotFound('Hold');
  await ClubAdminService.assertClubAdmin(userId, hold.clubId);
  return hold.clubId;
}

async function assertCourtClubAdmin(userId: string, courtId: string): Promise<string> {
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    select: { clubId: true },
  });
  if (!court) throw clubAdminNotFound('Court');
  await ClubAdminService.assertClubAdmin(userId, court.clubId);
  return court.clubId;
}

function parseGameActionBody(raw: unknown): ClubAdminGameActionBody {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (typeof body.reason !== 'string' || !body.reason.trim()) throw clubAdminValidation('reason', 'is required');
  for (const key of ['note', 'message'] as const) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') {
      throw clubAdminValidation(key, 'must be a string');
    }
  }
  if (body.notifyHost !== undefined && typeof body.notifyHost !== 'boolean') {
    throw clubAdminValidation('notifyHost', 'must be a boolean');
  }
  return {
    reason: body.reason.trim().slice(0, 200),
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    message: typeof body.message === 'string' ? body.message : null,
    notifyHost: body.notifyHost as boolean | undefined,
  };
}

export const listClubAdminClubs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseIntParam(req.query.limit, 'limit', { fallback: 20, min: 1, max: 50 });
  const offset = parseIntParam(req.query.offset, 'offset', { fallback: 0, min: 0, max: 100_000 });
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q : undefined;
  const data = await ClubAdminClubService.listClubs(req.userId!, limit, offset, q);
  res.json({ success: true, data });
});

export const getClubAdminClub = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminClubService.getClub(req.userId!, req.params.clubId);
  res.json({ success: true, data });
});

export const patchClubAdminClub = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminClubService.patchClub(req.userId!, req.params.clubId, req.body);
  res.json({ success: true, data });
});

export const listClubAdminReservations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseIntParam(req.query.limit, 'limit', { fallback: 20, min: 1, max: 50 });
  const offset = parseIntParam(req.query.offset, 'offset', { fallback: 0, min: 0, max: 100_000 });
  const data = await ClubAdminReservationsService.listReservations(
    req.params.clubId,
    limit,
    offset
  );
  res.json({ success: true, data });
});

export const getClubAdminSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Absent → club-local today (never the server's UTC date); malformed → 400.
  const date = req.query.date === undefined || req.query.date === '' ? undefined : req.query.date;
  if (date !== undefined && typeof date !== 'string') throw clubAdminValidation('date', 'must be yyyy-MM-dd');
  const courtId = typeof req.query.courtId === 'string' && req.query.courtId ? req.query.courtId : undefined;
  const data = await ClubAdminScheduleService.buildDaySchedule(
    req.params.clubId,
    date,
    courtId
  );
  res.json({ success: true, data });
});

export const listClubAdminCourts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminCourtService.listCourts(req.userId!, req.params.clubId);
  res.json({ success: true, data });
});

export const createClubAdminCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminCourtService.createCourt(req.userId!, req.params.clubId, req.body);
  res.status(201).json({ success: true, data });
});

export const createClubAdminHold = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { courtId, startTime, endTime, label, note } = (req.body ?? {}) as Record<string, unknown>;
  const data = await ClubAdminHoldService.createHold(req.userId!, req.params.clubId, {
    courtId,
    startTime,
    endTime,
    label,
    note,
  });
  res.status(201).json({ success: true, data });
});

export const patchClubAdminHold = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = await assertHoldClubAdmin(req.userId!, req.params.holdId);
  const data = await ClubAdminHoldService.updateHold(req.userId!, clubId, req.params.holdId, req.body ?? {});
  res.json({ success: true, data });
});

export const deleteClubAdminHold = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = await assertHoldClubAdmin(req.userId!, req.params.holdId);
  await ClubAdminHoldService.deleteHold(req.userId!, clubId, req.params.holdId);
  res.json({ success: true });
});

export const cancelClubAdminGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminGameService.cancelGame(
    req.userId!,
    req.params.clubId,
    req.params.gameId,
    parseGameActionBody(req.body)
  );
  res.json({ success: true, data });
});

export const clearClubAdminGameCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminGameService.clearCourtSlot(
    req.userId!,
    req.params.clubId,
    req.params.gameId,
    parseGameActionBody(req.body)
  );
  res.json({ success: true, data });
});

export const patchClubAdminCourtWithAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  await assertCourtClubAdmin(req.userId!, req.params.courtId);
  const data = await ClubAdminCourtService.patchCourt(req.userId!, req.params.courtId, req.body);
  res.json({ success: true, data });
});

export const deactivateClubAdminCourtWithAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  await assertCourtClubAdmin(req.userId!, req.params.courtId);
  const data = await ClubAdminCourtService.deactivateCourt(req.userId!, req.params.courtId);
  res.json({ success: true, data });
});
