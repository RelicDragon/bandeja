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

const LIVE_SPECTATOR_VER = 1 as const;

export type LiveSpectatorJwtPayload = {
  typ: 'live_spectator';
  gameId: string;
  matchId: string;
  ver: typeof LIVE_SPECTATOR_VER;
};

export function signLiveSpectatorToken(gameId: string, matchId: string): string {
  const body: LiveSpectatorJwtPayload = {
    typ: 'live_spectator',
    gameId,
    matchId,
    ver: LIVE_SPECTATOR_VER,
  };
  return jwt.sign(
    { ...body, jti: randomUUID() } as jwt.JwtPayload,
    config.jwtSecret,
    { expiresIn: '48h' }
  );
}

const LIVE_SPECTATOR_ID_MAX = 64;
const LIVE_SPECTATOR_QUERY_MAX = 4096;

export function liveSpectatorQueryTokenMaxBytes(): number {
  return LIVE_SPECTATOR_QUERY_MAX;
}

function assertCuidLikeId(label: string, value: string): void {
  if (!value || value.length > LIVE_SPECTATOR_ID_MAX) {
    throw new jwt.JsonWebTokenError(`Invalid live spectator ${label}`);
  }
  if (!/^[\w-]+$/.test(value)) {
    throw new jwt.JsonWebTokenError(`Invalid live spectator ${label}`);
  }
}

export function verifyLiveSpectatorToken(token: string): LiveSpectatorJwtPayload {
  if (token.length > LIVE_SPECTATOR_QUERY_MAX) {
    throw new jwt.JsonWebTokenError('Invalid live spectator token');
  }
  const decoded = jwt.verify(token, config.jwtSecret, {
    clockTolerance: 45,
  }) as jwt.JwtPayload & Partial<LiveSpectatorJwtPayload>;
  if (decoded.typ !== 'live_spectator' || decoded.ver !== LIVE_SPECTATOR_VER) {
    throw new jwt.JsonWebTokenError('Invalid live spectator token');
  }
  if (typeof decoded.gameId !== 'string' || typeof decoded.matchId !== 'string') {
    throw new jwt.JsonWebTokenError('Invalid live spectator payload');
  }
  assertCuidLikeId('gameId', decoded.gameId);
  assertCuidLikeId('matchId', decoded.matchId);
  return {
    typ: 'live_spectator',
    gameId: decoded.gameId,
    matchId: decoded.matchId,
    ver: LIVE_SPECTATOR_VER,
  };
}
