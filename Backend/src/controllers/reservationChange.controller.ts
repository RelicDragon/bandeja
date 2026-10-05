/**
 * Court-booking redesign endpoints (docs/domains/booking.md "Club-side drift",
 * "Reschedule journal"). All new routes — shipped apps never call them.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { acceptUpstreamDrift, recordUpstreamCheck } from '../services/game/bookingUpstreamDrift.service';
import {
  createReservationChange,
  finishReservationChange,
  getActiveReservationChange,
  patchReservationChangeStep,
  saveGameForReservationChange,
} from '../services/gameReservationChange/reservationChange.service';

/** `POST /games/:id/bookings/:linkId/upstream-check` `{ present, start?, end? }` → linked booking. */
export const postUpstreamCheck = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await recordUpstreamCheck(req.params.id, req.params.linkId, req.userId!, req.user?.isAdmin ?? false, req.body);
  res.json({ success: true, data });
});

/** `POST /games/:id/bookings/:linkId/accept-upstream` `{ mode, startTime?, endTime? }`. */
export const postAcceptUpstream = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await acceptUpstreamDrift(req.params.id, req.params.linkId, req.userId!, req.user?.isAdmin ?? false, req.body);
  res.json({ success: true, data });
});

/** `POST /games/:id/reservation-changes` `{ plan, fromStart, fromEnd, toStart, toEnd }`. */
export const postReservationChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const out = await createReservationChange(req.params.id, req.userId!, req.user?.isAdmin ?? false, req.body);
  res.status(out.resumed ? 200 : 201).json({ success: true, data: out.change, resumed: out.resumed, abandonedId: out.abandonedId });
});

/** `GET /games/:id/reservation-changes/active` → change | null. */
export const getActiveReservationChangeHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await getActiveReservationChange(req.params.id, req.userId!, req.user?.isAdmin ?? false);
  res.json({ success: true, data });
});

/** `PATCH /reservation-changes/:id/steps/:idempotencyKey` `{ status, result?, error? }`. */
export const patchReservationChangeStepHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await patchReservationChangeStep(
    req.params.id,
    req.params.idempotencyKey,
    req.userId!,
    req.user?.isAdmin ?? false,
    req.body,
  );
  res.json({ success: true, data });
});

/** `POST /reservation-changes/:id/finish` `{ state }`. */
export const postFinishReservationChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await finishReservationChange(req.params.id, req.userId!, req.user?.isAdmin ?? false, req.body);
  res.json({ success: true, data });
});

/** `POST /reservation-changes/:id/save-game` `{ startTime, endTime, slotUpdates?, linksToAdd?, linksToRemove? }`. */
export const postSaveGameForReservationChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await saveGameForReservationChange(req.params.id, req.userId!, req.user?.isAdmin ?? false, req.body);
  res.json({ success: true, data });
});
