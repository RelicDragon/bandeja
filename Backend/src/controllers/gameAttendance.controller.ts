/**
 * PRD 346 — attendance confirmation and no-show notes.
 *
 * Every endpoint here is informative. None of them changes a seat, a queue
 * position, a rating or a game status — see `services/gameAttendance/`.
 */
import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import {
  getAttendanceDetails,
  noteNoShow,
  nudgeUnanswered,
  setAttendance,
  undoNoShow,
  listMyNoShowNotes,
} from '../services/gameAttendance/gameAttendance.service';
import { isAttendanceAnswer } from '../services/gameAttendance/attendanceRules';
import {
  getAttendanceMonthlySeries,
  getAttendanceRate,
} from '../services/gameAttendance/attendanceCounters.service';
import { resolveSport } from '../sport/sportRegistry';

export const getGameAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const details = await getAttendanceDetails(id, req.userId);
  res.json({ success: true, data: details });
});

export const setGameAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const state: unknown = req.body?.state;
  if (!isAttendanceAnswer(state)) {
    throw new ApiError(400, 'errors.attendance.invalidState');
  }

  const result = await setAttendance(id, req.userId!, state);
  res.json({ success: true, data: result });
});

export const noteParticipantNoShow = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;
  const result = await noteNoShow(id, userId, req.userId!);
  res.json({ success: true, data: result });
});

export const undoParticipantNoShow = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;
  const result = await undoNoShow(id, userId, req.userId!);
  res.json({ success: true, data: result });
});

export const nudgeGameAttendance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await nudgeUnanswered(id, req.userId!);
  res.json({ success: true, data: result });
});

export const getMyNoShowNotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const notes = await listMyNoShowNotes(req.userId!);
  res.json({ success: true, data: notes });
});

export const getMyAttendanceRate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sport = resolveSport(
    typeof req.query.sport === 'string' ? req.query.sport : req.user?.primarySport,
  );
  const [summary, monthly] = await Promise.all([
    getAttendanceRate(req.userId!, sport),
    getAttendanceMonthlySeries(req.userId!, sport),
  ]);
  res.json({ success: true, data: { ...summary, monthly } });
});
