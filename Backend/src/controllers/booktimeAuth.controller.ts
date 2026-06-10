import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import * as booktimeAuthService from '../services/booktime/booktimeAuth.service';

function parseExpiresAt(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') throw new ApiError(400, 'expiresAt must be an ISO date string');
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'expiresAt is invalid');
  return d;
}

export const getBooktimeAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const status = await booktimeAuthService.getBooktimeAuthStatus(req.userId!, clubId);
  res.json({ success: true, data: status });
});

export const putBooktimeAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const { accessToken, refreshToken, externalUserId, phoneNumber, expiresAt } = req.body ?? {};

  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new ApiError(400, 'accessToken is required');
  }
  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    throw new ApiError(400, 'refreshToken is required');
  }
  if (typeof externalUserId !== 'string' || !externalUserId.trim()) {
    throw new ApiError(400, 'externalUserId is required');
  }

  const status = await booktimeAuthService.storeBooktimeAuth({
    userId: req.userId!,
    clubId,
    accessToken: accessToken.trim(),
    refreshToken: refreshToken.trim(),
    externalUserId: externalUserId.trim(),
    phoneNumber: typeof phoneNumber === 'string' ? phoneNumber.trim() || null : null,
    expiresAt: parseExpiresAt(expiresAt),
  });

  res.json({ success: true, data: status });
});

export const postBooktimeSessionToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const tokens = await booktimeAuthService.getBooktimeSessionTokens(req.userId!, clubId);
  if (!tokens) {
    throw new ApiError(404, 'Club booking connection not found');
  }
  res.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      externalUserId: tokens.externalUserId,
      expiresAt: tokens.expiresAt?.toISOString() ?? null,
    },
  });
});

export const deleteBooktimeAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  await booktimeAuthService.disconnectBooktimeAuth(req.userId!, clubId);
  res.json({ success: true, data: { connected: false } });
});

function parseExcludeAuthIds(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export const getBooktimeScoutToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const excludeAuthIds = parseExcludeAuthIds(req.query.excludeAuthIds);
  const picked = await booktimeAuthService.pickScoutAccessToken(clubId, req.userId!, {
    maxAttempts: 3,
    excludeAuthIds,
  });
  if (!picked) {
    res.json({ success: true, data: { available: false as const } });
    return;
  }
  res.json({
    success: true,
    data: { available: true as const, authId: picked.authId, accessToken: picked.accessToken },
  });
});

export const invalidateBooktimeScoutToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const authId = req.body?.authId;
  if (typeof authId !== 'string' || !authId.trim()) {
    throw new ApiError(400, 'authId is required');
  }
  const row = await booktimeAuthService.getScoutAuthForClub(clubId, authId.trim());
  if (!row) {
    throw new ApiError(404, 'Scout auth not found for this club');
  }
  await booktimeAuthService.markScoutInvalid(authId.trim());
  res.json({ success: true, data: { invalidated: true } });
});
