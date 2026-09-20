/**
 * PRD 351 — admin referral dashboard, CSV export and revoke.
 *
 * Its own controller (like `adminAd.controller.ts`) rather than more lines in
 * `admin.controller.ts`, which several PRDs in this programme are editing at
 * once. Every route is `requireAdmin` in `admin.routes.ts`.
 */
import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import {
  getAdminReferralCsv,
  getAdminReferralReport,
  type AdminReferralFilters,
} from '../services/referral/adminReferral.service';
import { revokeReferralReward } from '../services/referral/referralReward.service';

function readFilters(req: AuthRequest): AdminReferralFilters {
  return {
    startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  };
}

export const getAdminReferrals = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await getAdminReferralReport(readFilters(req));
  res.json({ success: true, data });
});

export const exportAdminReferrals = asyncHandler(async (req: AuthRequest, res: Response) => {
  const csv = await getAdminReferralCsv(readFilters(req));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="referrals.csv"');
  res.send(csv);
});

export const revokeAdminReferralReward = asyncHandler(async (req: AuthRequest, res: Response) => {
  const rewardId = String(req.params.rewardId ?? '').trim();
  if (!rewardId) throw new ApiError(400, 'referral.errors.invalidReward');
  const revoked = await revokeReferralReward(rewardId);
  if (!revoked) throw new ApiError(404, 'referral.errors.rewardNotFound');
  res.json({ success: true });
});
