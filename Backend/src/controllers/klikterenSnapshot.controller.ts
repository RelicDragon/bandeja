import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as klikterenSnapshotService from '../services/klikteren/klikterenSnapshot.service';

export const getKlikterenSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  const snapshot = await klikterenSnapshotService.getKlikterenSnapshot(clubId, date);
  res.json({ success: true, data: snapshot });
});

export const putKlikterenSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const snapshot = await klikterenSnapshotService.replaceKlikterenSnapshot(req.userId!, clubId, req.body ?? {});
  res.json({ success: true, data: snapshot });
});
