import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ClubAdminRequest, getClubAdminContext } from '../middleware/clubAdminContext';
import { getClubPricing, getPriceQuote, putClubPricing } from '../services/clubAdmin/clubAdminPricing.service';
import {
  createCharge,
  getCharge,
  listPayments,
  patchCharge,
  recordPayment,
  voidPayment,
  type BillingCtx,
} from '../services/clubAdmin/clubAdminBilling.service';

/** Club console pricing & billing (docs/domains/club-admin.md "Pricing", "Billing"). */

function billingCtx(req: ClubAdminRequest): BillingCtx {
  const ctx = getClubAdminContext(req);
  return { clubId: ctx.clubId, timezone: ctx.timezone, currency: ctx.currency };
}

export const getPricing = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await getClubPricing(getClubAdminContext(req).clubId) });
});

export const putPricing = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await putClubPricing(getClubAdminContext(req).clubId, req.userId!, req.body) });
});

export const getQuote = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await getPriceQuote(getClubAdminContext(req).clubId, req.query as Record<string, unknown>) });
});

export const postCharge = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.status(201).json({ success: true, data: await createCharge(billingCtx(req), req.userId!, req.body) });
});

export const getChargeById = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await getCharge(getClubAdminContext(req).clubId, req.params.chargeId) });
});

export const patchChargeById = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await patchCharge(billingCtx(req), req.userId!, req.params.chargeId, req.body) });
});

export const postPayment = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.status(201).json({ success: true, data: await recordPayment(billingCtx(req), req.userId!, req.params.chargeId, req.body) });
});

export const deletePayment = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({
    success: true,
    data: await voidPayment(billingCtx(req), req.userId!, req.params.chargeId, req.params.paymentId),
  });
});

export const getPayments = asyncHandler(async (req: ClubAdminRequest, res: Response) => {
  res.json({ success: true, data: await listPayments(billingCtx(req), req.query as Record<string, unknown>) });
});
