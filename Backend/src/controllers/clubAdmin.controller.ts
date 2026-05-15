import { Response } from 'express';
import { CourtSlotHoldLabel } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { ClubAdminService } from '../services/clubAdmin/clubAdmin.service';
import { ClubAdminClubService } from '../services/clubAdmin/clubAdminClub.service';
import { ClubAdminScheduleService } from '../services/clubAdmin/clubAdminSchedule.service';
import { ClubAdminCourtService } from '../services/clubAdmin/clubAdminCourt.service';
import { ClubAdminHoldService } from '../services/clubAdmin/clubAdminHold.service';
import { ClubAdminGameService } from '../services/clubAdmin/clubAdminGame.service';
import prisma from '../config/database';

async function assertHoldClubAdmin(userId: string, holdId: string): Promise<string> {
  const hold = await prisma.courtSlotHold.findUnique({
    where: { id: holdId },
    select: { clubId: true },
  });
  if (!hold) throw new ApiError(404, 'Hold not found');
  await ClubAdminService.assertClubAdmin(userId, hold.clubId);
  return hold.clubId;
}

async function assertCourtClubAdmin(userId: string, courtId: string): Promise<string> {
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    select: { clubId: true },
  });
  if (!court) throw new ApiError(404, 'Court not found');
  await ClubAdminService.assertClubAdmin(userId, court.clubId);
  return court.clubId;
}

export const listClubAdminClubs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminClubService.listClubs(req.userId!);
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

export const getClubAdminSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const courtId = req.query.courtId as string | undefined;
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
  const { courtId, startTime, endTime, label, note } = req.body;
  const data = await ClubAdminHoldService.createHold(req.userId!, req.params.clubId, {
    courtId,
    startTime,
    endTime,
    label: label as CourtSlotHoldLabel,
    note,
  });
  res.status(201).json({ success: true, data });
});

export const patchClubAdminHold = asyncHandler(async (req: AuthRequest, res: Response) => {
  await assertHoldClubAdmin(req.userId!, req.params.holdId);
  const data = await ClubAdminHoldService.updateHold(req.userId!, req.params.holdId, req.body);
  res.json({ success: true, data });
});

export const deleteClubAdminHold = asyncHandler(async (req: AuthRequest, res: Response) => {
  await assertHoldClubAdmin(req.userId!, req.params.holdId);
  await ClubAdminHoldService.deleteHold(req.userId!, req.params.holdId);
  res.json({ success: true });
});

export const cancelClubAdminGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminGameService.cancelGame(
    req.userId!,
    req.params.clubId,
    req.params.gameId,
    req.body
  );
  res.json({ success: true, data });
});

export const clearClubAdminGameCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await ClubAdminGameService.clearCourtSlot(
    req.userId!,
    req.params.clubId,
    req.params.gameId,
    req.body
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
