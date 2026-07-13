import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import * as padelooAuthService from '../services/padeloo/padelooAuth.service';

function parseOptionalName(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new ApiError(400, 'Name must be a string');
  const trimmed = raw.trim();
  return trimmed || null;
}

export const getPadelooAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const status = await padelooAuthService.getPadelooAuthStatus(req.userId!, clubId);
  res.json({ success: true, data: status });
});

export const putPadelooAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const { accessToken, refreshToken, externalUserId, email, firstName, lastName } = req.body ?? {};

  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new ApiError(400, 'accessToken is required');
  }
  if (typeof externalUserId !== 'string' || !externalUserId.trim()) {
    throw new ApiError(400, 'externalUserId is required');
  }

  const status = await padelooAuthService.storePadelooAuth({
    userId: req.userId!,
    clubId,
    accessToken: accessToken.trim(),
    refreshToken: typeof refreshToken === 'string' ? refreshToken.trim() || null : null,
    externalUserId: externalUserId.trim(),
    email: typeof email === 'string' ? email.trim() || null : null,
    firstName: parseOptionalName(firstName),
    lastName: parseOptionalName(lastName),
  });

  res.json({ success: true, data: status });
});

export const postPadelooSessionToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const tokens = await padelooAuthService.getPadelooSessionTokens(req.userId!, clubId);
  if (!tokens) {
    throw new ApiError(404, BOOKING_ERROR_KEYS.connectionNotFound);
  }
  res.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      externalUserId: tokens.externalUserId,
    },
  });
});

export const deletePadelooAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  await padelooAuthService.disconnectPadelooAuth(req.userId!, clubId);
  res.json({ success: true, data: { connected: false } });
});
