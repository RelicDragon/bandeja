import type { Request } from 'express';
import { generateShortAccessToken, type JwtPayload } from '../../utils/jwt';
import { config } from '../../config/env';
import { createUserRefreshSession } from './userRefreshSession.service';

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
  const token = generateShortAccessToken(jwtPayload);
  if (!config.refreshTokenEnabled) {
    return { token };
  }
  const { refreshToken, sessionId } = await createUserRefreshSession(jwtPayload.userId, req);
  return { token, refreshToken, currentSessionId: sessionId };
}

/** Admin HTML panel: short-lived access JWTs; refresh when enabled. */
export async function issueAdminPanelLoginTokens(
  jwtPayload: Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'>,
  req: Request
): Promise<{ token: string; refreshToken?: string; currentSessionId?: string }> {
  return issueLoginTokens(jwtPayload, req);
}
