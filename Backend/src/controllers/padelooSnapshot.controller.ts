import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as padelooSnapshotService from '../services/padeloo/padelooSnapshot.service';

export const getPadelooSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  const snapshot = await padelooSnapshotService.getPadelooSnapshot(clubId, date);
  res.json({ success: true, data: snapshot });
});

export const putPadelooSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const snapshot = await padelooSnapshotService.replacePadelooSnapshot(req.userId!, clubId, req.body ?? {});
  res.json({ success: true, data: snapshot });
});
