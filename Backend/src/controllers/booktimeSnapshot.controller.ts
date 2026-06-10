import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import * as booktimeSnapshotService from '../services/booktime/booktimeSnapshot.service';

export const getBooktimeSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const date = req.query.date as string;
  if (!date) {
    throw new ApiError(400, 'date query parameter is required');
  }
  const data = await booktimeSnapshotService.getBooktimeSnapshot(clubId, date);
  res.json({ success: true, data });
});

export const putBooktimeSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const data = await booktimeSnapshotService.replaceBooktimeSnapshot(req.userId!, clubId, req.body ?? {});
  res.json({ success: true, data });
});
