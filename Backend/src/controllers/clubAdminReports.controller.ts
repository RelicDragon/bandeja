import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ClubAdminRequest, getClubAdminContext } from '../middleware/clubAdminContext';
import { getClubReport } from '../services/clubAdmin/clubAdminReports.service';
import { streamClubReportCsv } from '../services/clubAdmin/clubAdminReportsExport.service';
import { listClubActivity, listClubReviews } from '../services/clubAdmin/clubAdminFeed.service';

/** Club console reports, CSV export, activity and reviews (docs/domains/club-admin.md "Reports"). */

export const getReport = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await getClubReport(getClubAdminContext(req), req.userId!, req.query as Record<string, unknown>) });
});

export const exportReportCsv = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  await streamClubReportCsv(res, getClubAdminContext(req), req.userId!, req.query as Record<string, unknown>);
});

export const getActivity = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await listClubActivity(getClubAdminContext(req).clubId, req.query as Record<string, unknown>) });
});

export const getReviews = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await listClubReviews(getClubAdminContext(req).clubId, req.query as Record<string, unknown>) });
});
