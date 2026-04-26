import type { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { AuthRequest } from '../middleware/auth';
import {
  refreshWithRotation,
  revokeByRawToken,
  revokeAllRefreshSessionsForUser,
  listSessionsForUser,
  revokeSessionByIdForUser,
  activeUserRefreshMatchesSessionId,
} from '../services/auth/userRefreshSession.service';
import {
  clearRefreshTokenCookie,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
  shouldUseWebRefreshHttpOnlyCookie,
} from '../utils/refreshWebCookie';
import { config } from '../config/env';

export const postRefresh = asyncHandler(async (req, res: Response) => {
  const raw = readRefreshTokenFromRequest(req);
  if (!raw.trim()) {
    throw new ApiError(400, 'auth.refreshTokenRequired', true, { code: 'auth.refreshTokenRequired' });
  }
  const out = await refreshWithRotation(raw, req);
  const webCookie = shouldUseWebRefreshHttpOnlyCookie(req);
  if (webCookie) {
    setRefreshTokenCookie(res, out.refreshToken);
  }
  const includeJsonRefresh = !webCookie || config.refreshWebHttpOnlyJsonBody;
  res.json({
    success: true,
    data: {
      token: out.token,
      ...(includeJsonRefresh ? { refreshToken: out.refreshToken } : {}),
      user: out.user,
      currentSessionId: out.currentSessionId,
    },
  });
});

export const postLogout = asyncHandler(async (req, res: Response) => {
  const rt = readRefreshTokenFromRequest(req) || undefined;
  await revokeByRawToken(rt);
  clearRefreshTokenCookie(res);
  res.json({ success: true, data: {} });
});

export const postLogoutAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required');
  }
  await revokeAllRefreshSessionsForUser(req.userId);
  if (shouldUseWebRefreshHttpOnlyCookie(req)) {
    clearRefreshTokenCookie(res);
  }
  res.json({ success: true, data: {} });
});

export const getSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required');
  }
  const sessions = await listSessionsForUser(req.userId);
  res.json({ success: true, data: { sessions } });
});

export const deleteSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required');
  }
  const { id } = req.params;
  if (!id) {
    throw new ApiError(400, 'Session id required');
  }
  const raw = readRefreshTokenFromRequest(req);
  const revokedCurrentWebRefresh =
    shouldUseWebRefreshHttpOnlyCookie(req) &&
    (await activeUserRefreshMatchesSessionId(req.userId, id, raw));
  await revokeSessionByIdForUser(req.userId, id);
  if (revokedCurrentWebRefresh) {
    clearRefreshTokenCookie(res);
  }
  res.json({ success: true, data: { revokedCurrentWebRefresh } });
});
