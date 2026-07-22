import type { Request } from 'express';
import { generateLegacyAccessToken, generateShortAccessToken, type JwtPayload } from '../../utils/jwt';
import { config } from '../../config/env';
import { clientVersionSupportsRefresh } from '../../utils/clientVersion';
import { createUserRefreshSession } from './userRefreshSession.service';
import { ApiError } from '../../utils/ApiError';

function legacyJwtIssuanceSunsetActive(): boolean {
  const end = config.legacyJwtIssuanceEndAt;
  if (!end) return false;
  return Date.now() >= end.getTime();
}

/**
 * When true, login cannot fall back to long-lived JWT.
 * Production never issues legacy JWTs (#315); elsewhere blocked after sunset when refresh is on.
 */
function legacyLongJwtIssuanceBlocked(req: Request): boolean {
  if (clientVersionSupportsRefresh(req)) return false;
  if (config.nodeEnv === 'production') return true;
  return config.refreshTokenEnabled && legacyJwtIssuanceSunsetActive();
}

/**
 * Call before creating a new user so registration is not committed when tokens cannot be issued.
 * Also invoked from issueLoginTokens for all login/token paths.
 */
export function assertLoginIssuanceAllowed(req: Request): void {
  if (!legacyLongJwtIssuanceBlocked(req)) return;
  const endedAt = config.legacyJwtIssuanceEndAt;
  throw new ApiError(403, 'auth.clientUpgradeRequired', true, {
    code: 'auth.clientUpgradeRequired',
    minClientVersion: config.minClientVersionForRefresh,
    ...(endedAt && { legacyJwtIssuanceEndedAt: endedAt.toISOString() }),
  });
}

export function jwtPayloadFromAuthUser(user: {
  id: string;
  phone?: string | null;
  telegramId?: string | null;
  appleSub?: string | null;
  googleId?: string | null;
  isAdmin?: boolean | null;
}): Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'> {
  const payload: Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'> = { userId: user.id };
  if (user.phone) payload.phone = user.phone;
  if (user.telegramId) payload.telegramId = user.telegramId;
  if (user.appleSub) payload.appleSub = user.appleSub;
  if (user.googleId) payload.googleId = user.googleId;
  if (user.isAdmin) payload.isAdmin = true;
  return payload;
}

export async function issueLoginTokens(
  jwtPayload: Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'>,
  req: Request
): Promise<{ token: string; refreshToken?: string; currentSessionId?: string }> {
  assertLoginIssuanceAllowed(req);

  // Production: short access + refresh only (never legacy), regardless of kill-switches.
  if (config.nodeEnv === 'production') {
    const token = generateShortAccessToken(jwtPayload);
    const { refreshToken, sessionId } = await createUserRefreshSession(jwtPayload.userId, req);
    return { token, refreshToken, currentSessionId: sessionId };
  }

  if (!config.refreshTokenEnabled || !clientVersionSupportsRefresh(req)) {
    return { token: generateLegacyAccessToken(jwtPayload) };
  }
  const token = generateShortAccessToken(jwtPayload);
  const { refreshToken, sessionId } = await createUserRefreshSession(jwtPayload.userId, req);
  return { token, refreshToken, currentSessionId: sessionId };
}

/**
 * Admin HTML panel: always issue short-lived access JWTs (never legacy), so verify survives
 * legacy JWT sunset even when REFRESH_TOKEN_ENABLED=false or X-Client-Version is absent.
 */
export async function issueAdminPanelLoginTokens(
  jwtPayload: Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'>,
  req: Request
): Promise<{ token: string; refreshToken?: string; currentSessionId?: string }> {
  const token = generateShortAccessToken(jwtPayload);
  if (!config.refreshTokenEnabled) {
    return { token };
  }
  const { refreshToken, sessionId } = await createUserRefreshSession(jwtPayload.userId, req);
  return { token, refreshToken, currentSessionId: sessionId };
}
