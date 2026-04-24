import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../config/env';

const ACCESS_VER = 1;

function legacyJwtVerifyCutoffActive(): boolean {
  const end = config.legacyJwtIssuanceEndAt;
  if (!end) return false;
  return Date.now() >= end.getTime();
}

/** Thrown when a legacy (non-access) JWT is no longer accepted after `LEGACY_JWT_ISSUANCE_END_AT`. */
export class LegacyJwtVerifyRejectedError extends Error {
  constructor() {
    super('LegacyJwtVerifyRejected');
    this.name = 'LegacyJwtVerifyRejectedError';
  }
}

export interface JwtPayload {
  userId: string;
  phone?: string;
  telegramId?: string;
  appleSub?: string;
  appleId?: string;
  googleId?: string;
  isAdmin?: boolean;
  typ?: string;
  iss?: string;
  aud?: string | string[];
  jti?: string;
  ver?: number;
}

function signJwt(body: Record<string, unknown>, expiresIn: string): string {
  return jwt.sign(body, config.jwtSecret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function generateLegacyAccessToken(
  payload: Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'>
): string {
  const body: Record<string, unknown> = { ...payload };
  return signJwt(body, config.jwtExpiresIn);
}

export function generateShortAccessToken(
  payload: Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'>
): string {
  const body: Record<string, unknown> = {
    ...payload,
    typ: 'access',
    ver: ACCESS_VER,
    jti: randomUUID(),
    iss: config.jwtIssuer,
    aud: config.jwtAudience,
  };
  return signJwt(body, config.jwtAccessExpiresIn);
}

export const generateToken = (
  payload: Omit<JwtPayload, 'typ' | 'jti' | 'iss' | 'aud' | 'ver'>
): string => generateLegacyAccessToken(payload);

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload & JwtPayload;
  if (decoded.typ !== 'access') {
    if (config.refreshTokenEnabled && legacyJwtVerifyCutoffActive()) {
      throw new LegacyJwtVerifyRejectedError();
    }
  }
  if (decoded.typ === 'access') {
    if (decoded.aud !== config.jwtAudience) {
      throw new jwt.JsonWebTokenError('Invalid audience');
    }
    if (decoded.iss !== config.jwtIssuer) {
      throw new jwt.JsonWebTokenError('Invalid issuer');
    }
  }
  return decoded as JwtPayload;
}
