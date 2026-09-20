import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';
import {
  getGameCostSummary,
  getOwedSummary,
  markOwnShareAsPaid,
  setShareConfirmed,
  updateGameCostShares,
  PAYMENT_HINT_MAX_LENGTH,
  type MarkPaidMethod,
} from '../services/gameCost/gameCost.service';
import {
  getRemindAvailableAt,
  remindUnpaidShares,
} from '../services/gameCost/costShareReminder.service';
import type { UpdateCostSharesInput } from '../services/gameCost/gameCost.types';

/**
 * PRD 348 — cost split ledger endpoints.
 *
 * Every handler is authenticated; the permission matrix itself lives in
 * `services/gameCost/costSharePermissions.ts` and is applied inside the service,
 * so there is exactly one place where "who may confirm a share" is decided.
 *
 * With the feature flag off every route answers 404, which is what the frontend
 * flag reader expects (nothing rendered, no request made).
 */

function assertEnabled(): void {
  if (!config.costSplitEnabled) throw new ApiError(404, 'errors.games.notFound');
}

function requireUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) throw new ApiError(401, 'errors.auth.unauthorized');
  return userId;
}

export const getCostShares = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertEnabled();
  const userId = requireUserId(req);
  const { id } = req.params;

  const remindAvailableAt = await getRemindAvailableAt(id);
  const data = await getGameCostSummary(id, userId, remindAvailableAt);

  res.json({ success: true, data });
});

function parseUpdateInput(body: unknown): UpdateCostSharesInput {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'errors.cost.invalidPayload');
  const raw = body as Record<string, unknown>;
  const input: UpdateCostSharesInput = {};

  if ('payerUserId' in raw) {
    const value = raw.payerUserId;
    if (value !== null && typeof value !== 'string') {
      throw new ApiError(400, 'errors.cost.invalidPayload');
    }
    input.payerUserId = value;
  }

  if ('paymentHint' in raw) {
    const value = raw.paymentHint;
    if (value !== null && typeof value !== 'string') {
      throw new ApiError(400, 'errors.cost.invalidPayload');
    }
    if (typeof value === 'string' && value.length > PAYMENT_HINT_MAX_LENGTH) {
      throw new ApiError(400, 'errors.cost.paymentHintTooLong');
    }
    input.paymentHint = value;
  }

  if ('overrides' in raw) {
    const value = raw.overrides;
    if (!Array.isArray(value)) throw new ApiError(400, 'errors.cost.invalidPayload');
    input.overrides = value.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new ApiError(400, 'errors.cost.invalidPayload');
      }
      const row = entry as Record<string, unknown>;
      if (typeof row.userId !== 'string' || typeof row.amountMinor !== 'number') {
        throw new ApiError(400, 'errors.cost.invalidPayload');
      }
      return { userId: row.userId, amountMinor: row.amountMinor };
    });
  }

  if ('splitRemainderEvenly' in raw) {
    if (typeof raw.splitRemainderEvenly !== 'boolean') {
      throw new ApiError(400, 'errors.cost.invalidPayload');
    }
    input.splitRemainderEvenly = raw.splitRemainderEvenly;
  }

  return input;
}

export const putCostShares = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertEnabled();
  const userId = requireUserId(req);
  const { id } = req.params;

  const data = await updateGameCostShares(id, userId, parseUpdateInput(req.body));

  res.json({ success: true, data });
});

export const markMyShareAsPaid = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertEnabled();
  const userId = requireUserId(req);
  const { id } = req.params;

  const rawMethod = (req.body as { method?: unknown } | undefined)?.method;
  const method: MarkPaidMethod = rawMethod === 'COINS' ? 'COINS' : 'MANUAL';
  if (rawMethod !== undefined && rawMethod !== 'COINS' && rawMethod !== 'MANUAL') {
    throw new ApiError(400, 'errors.cost.invalidMethod');
  }

  const data = await markOwnShareAsPaid(id, userId, method);

  res.json({ success: true, data });
});

export const confirmShare = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertEnabled();
  const actorId = requireUserId(req);
  const { id, userId } = req.params;

  const rawConfirmed = (req.body as { confirmed?: unknown } | undefined)?.confirmed;
  if (rawConfirmed !== undefined && typeof rawConfirmed !== 'boolean') {
    throw new ApiError(400, 'errors.cost.invalidPayload');
  }
  const confirmed = rawConfirmed === undefined ? true : rawConfirmed;

  const data = await setShareConfirmed(id, actorId, userId, confirmed);

  res.json({ success: true, data });
});

export const remindUnpaid = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertEnabled();
  const userId = requireUserId(req);
  const { id } = req.params;

  const result = await remindUnpaidShares(id, userId);

  res.json({ success: true, data: result });
});

export const getOwed = asyncHandler(async (req: AuthRequest, res: Response) => {
  // The only cost handler that used to answer with the flag off. The service
  // returns an empty result either way, so this is about the 404 convention the
  // other five follow, not about leaking data.
  assertEnabled();
  const userId = requireUserId(req);
  const data = await getOwedSummary(userId);
  res.json({ success: true, data });
});
