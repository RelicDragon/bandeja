/**
 * PRD 353 — monthly recap story and share card.
 *
 * Routes: `Backend/src/routes/recap.routes.ts` (mounted at `/api/users`).
 * Every endpoint is scoped to `req.userId`: a recap is private to its owner
 * until the owner shares it, and sharing publishes *rendered images*, never
 * this payload.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  getMonthlyRecap,
  getUnviewedMonthlyRecap,
  listMonthlyRecaps,
  loadRecapPayloadForShare,
  markMonthlyRecapViewed,
} from '../services/recap/recap.service';
import { runMonthlyRecapPassNow } from '../services/recap/monthlyRecapScheduler.service';
import {
  exportRecapSummaryCard,
  shareRecapToFollowers,
} from '../services/recap/recapShare.service';
import { loadRecapOwner } from '../services/recap/recapInputs.loader';

function requireUserId(req: AuthRequest): string {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'errors.unauthorized');
  return userId;
}

function readSlideKeys(body: unknown): string[] {
  const raw = (body as { slideKeys?: unknown } | undefined)?.slideKeys;
  if (!Array.isArray(raw)) {
    throw new ApiError(400, 'errors.recap.noSlidesSelected');
  }
  const keys = raw.filter((key): key is string => typeof key === 'string' && key.length > 0);
  if (keys.length === 0) {
    throw new ApiError(400, 'errors.recap.noSlidesSelected');
  }
  return [...new Set(keys)];
}

export const listRecaps = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req);
  const [recaps, unviewed] = await Promise.all([
    listMonthlyRecaps(userId),
    getUnviewedMonthlyRecap(userId),
  ]);
  res.json({ success: true, data: { recaps, unviewed } });
});

export const getRecap = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req);
  const detail = await getMonthlyRecap(userId, req.params.monthKey);
  res.json({ success: true, data: detail });
});

export const markRecapViewed = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req);
  const result = await markMonthlyRecapViewed(userId, req.params.monthKey);
  res.json({ success: true, data: result });
});

export const shareRecap = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req);
  const monthKey = req.params.monthKey;
  const slideKeys = readSlideKeys(req.body);

  const [payload, owner] = await Promise.all([
    loadRecapPayloadForShare(userId, monthKey),
    loadRecapOwner(userId),
  ]);
  if (!owner) throw new ApiError(404, 'errors.recap.notFound');

  const result = await shareRecapToFollowers({
    userId,
    language: owner.language,
    payload,
    slideKeys,
  });
  res.json({ success: true, data: result });
});

export const exportRecap = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req);
  const monthKey = req.params.monthKey;

  const [payload, owner] = await Promise.all([
    loadRecapPayloadForShare(userId, monthKey),
    loadRecapOwner(userId),
  ]);
  if (!owner) throw new ApiError(404, 'errors.recap.notFound');

  const result = await exportRecapSummaryCard({ userId, language: owner.language, payload });
  res.json({ success: true, data: result });
});

/**
 * `POST /admin/recaps/backfill` — regenerate a month's recaps by hand.
 *
 * PRD 353's scheduler only runs on the 1st–3rd. Without this, a month missed
 * because the job was down, or a payload that needs re-deriving after a data
 * fix, had no operator surface at all: `runOnce({ force: true, monthKey })`
 * existed but could only be reached from a Node REPL on the box.
 *
 * Idempotent through `MonthlyRecap`'s `(userId, monthKey)` unique — a rerun
 * refreshes payloads rather than duplicating them, and never re-publishes a
 * story (only a user's own share does that).
 */
export const adminBackfillRecaps = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as { monthKey?: unknown };
  const monthKey = typeof body.monthKey === 'string' ? body.monthKey.trim() : '';
  if (monthKey && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new ApiError(400, 'errors.recap.invalidMonthKey');
  }

  const stats = await runMonthlyRecapPassNow({
    force: true,
    ...(monthKey ? { monthKey } : {}),
  });
  if (!stats) {
    // `runMonthlyRecapPassNow` returns null only when a pass is already in flight.
    throw new ApiError(409, 'errors.recap.backfillInProgress');
  }

  res.json({ success: true, data: { ...stats, requestedMonthKey: monthKey || null } });
});
