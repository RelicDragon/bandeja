import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import type { AuthRequest } from '../middleware/auth';
import {
  refreshActiveSessionFromCandidates,
  revokePresentedRefreshTokens,
  revokeAllRefreshSessionsForUser,
  listSessionsForUser,
  revokeSessionByIdForUser,
  activeUserRefreshMatchesSessionId,
} from '../services/auth/userRefreshSession.service';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCandidatesFromRequest,
  setRefreshTokenCookie,
  shouldUseCookieForRefreshResponse,
  shouldUseWebRefreshHttpOnlyCookie,
} from '../utils/refreshWebCookie';
import { config } from '../config/env';
import { getClientPlatform } from '../utils/clientVersion';
import {
  authRefreshOutcomeFromCode,
  recordAndPersistAuthRefreshMetric,
} from '../services/auth/authRefreshMetrics';

const REFRESH_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function readRefreshRequestId(req: Request): string | null {
  const raw = req.headers['x-refresh-request-id'];
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim();
  if (!REFRESH_REQUEST_ID_PATTERN.test(normalized)) {
    throw new ApiError(400, 'auth.refreshRequestIdInvalid', true, {
      code: 'auth.refreshRequestIdInvalid',
    });
  }
  return normalized;
}

export const postRefresh = asyncHandler(async (req, res: Response) => {
  const startedAt = Date.now();
  const platform = getClientPlatform(req);
  const clientVersion =
    typeof req.headers['x-client-version'] === 'string'
      ? req.headers['x-client-version'].slice(0, 32)
      : null;
  try {
    const out = await refreshActiveSessionFromCandidates(
      readRefreshTokenCandidatesFromRequest(req),
      req,
      readRefreshRequestId(req)
    );
    const webCookie = shouldUseCookieForRefreshResponse(req);
    if (webCookie) {
      setRefreshTokenCookie(res, out.refreshToken, req);
    }
    const includeJsonRefresh = !webCookie || config.refreshWebHttpOnlyJsonBody;
    recordAndPersistAuthRefreshMetric({
      outcome: 'success',
      platform,
      clientVersion,
      durationMs: Date.now() - startedAt,
    });
    res.json({
      success: true,
      data: {
        token: out.token,
        ...(includeJsonRefresh ? { refreshToken: out.refreshToken } : {}),
        user: out.user,
        currentSessionId: out.currentSessionId,
      },
    });
  } catch (error) {
    const code = error instanceof ApiError ? error.data?.code : undefined;
    recordAndPersistAuthRefreshMetric({
      outcome: authRefreshOutcomeFromCode(code),
      platform,
      clientVersion,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
});

export const postLogout = asyncHandler(async (req, res: Response) => {
  await revokePresentedRefreshTokens(readRefreshTokenCandidatesFromRequest(req));
  clearRefreshTokenCookie(res, req);
  res.json({ success: true, data: {} });
});

export const postLogoutAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required');
  }
  await revokeAllRefreshSessionsForUser(req.userId);
  if (shouldUseWebRefreshHttpOnlyCookie(req)) {
    clearRefreshTokenCookie(res, req);
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
  const userId = req.userId;
  const { id } = req.params;
  if (!id) {
    throw new ApiError(400, 'Session id required');
  }
  const candidates = readRefreshTokenCandidatesFromRequest(req);
  const revokedCurrentWebRefresh =
    shouldUseWebRefreshHttpOnlyCookie(req) &&
    (
      await Promise.all(
        candidates.map((raw) => activeUserRefreshMatchesSessionId(userId, id, raw))
      )
    ).some(Boolean);
  await revokeSessionByIdForUser(userId, id);
  if (revokedCurrentWebRefresh) {
    clearRefreshTokenCookie(res, req);
  }
  res.json({ success: true, data: { revokedCurrentWebRefresh } });
});
