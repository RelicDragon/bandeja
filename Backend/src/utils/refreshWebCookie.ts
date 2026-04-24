import type { Request, Response } from 'express';
import { config } from '../config/env';
import { getClientPlatform } from './clientVersion';
import { expiresInToMaxAgeSeconds } from './tokenExpiry';

export function shouldUseWebRefreshHttpOnlyCookie(req: Request): boolean {
  return (
    config.refreshTokenEnabled &&
    config.refreshWebHttpOnlyCookie &&
    getClientPlatform(req) === 'web'
  );
}

function parseCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const segments = header.split(';');
  for (const seg of segments) {
    const idx = seg.indexOf('=');
    if (idx === -1) continue;
    const k = seg.slice(0, idx).trim();
    if (k !== name) continue;
    try {
      return decodeURIComponent(seg.slice(idx + 1).trim());
    } catch {
      return seg.slice(idx + 1).trim();
    }
  }
  return undefined;
}

export function readRefreshTokenFromRequest(req: Request): string {
  const body = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  const fromCookie = parseCookieHeader(req.headers.cookie, config.refreshCookieName)?.trim() ?? '';
  return body || fromCookie;
}

function buildCookiePair(value: string, maxAge: number): string {
  let sameSite = config.refreshCookieSameSite;
  let secure = config.refreshCookieSecure;
  if (sameSite === 'none' && !secure) secure = true;
  const ss = sameSite.charAt(0).toUpperCase() + sameSite.slice(1);
  const parts = [
    `${encodeURIComponent(config.refreshCookieName)}=${encodeURIComponent(value)}`,
    `Path=${config.refreshCookiePath}`,
    'HttpOnly',
    `Max-Age=${maxAge}`,
    `SameSite=${ss}`,
  ];
  if (secure) parts.push('Secure');
  if (config.refreshCookieDomain) parts.push(`Domain=${config.refreshCookieDomain}`);
  return parts.join('; ');
}

export function setRefreshTokenCookie(res: Response, rawToken: string): void {
  const maxAge = expiresInToMaxAgeSeconds(config.refreshTokenExpiresIn);
  res.append('Set-Cookie', buildCookiePair(rawToken, maxAge));
}

export function clearRefreshTokenCookie(res: Response): void {
  res.append('Set-Cookie', buildCookiePair('', 0));
}

export function issuedRefreshJsonPayload(
  req: Request,
  res: Response,
  issued: { refreshToken?: string; currentSessionId?: string }
): { refreshToken?: string; currentSessionId?: string } {
  if (!issued.refreshToken) {
    if (shouldUseWebRefreshHttpOnlyCookie(req)) clearRefreshTokenCookie(res);
    return {};
  }
  if (shouldUseWebRefreshHttpOnlyCookie(req)) {
    setRefreshTokenCookie(res, issued.refreshToken);
    return issued.currentSessionId ? { currentSessionId: issued.currentSessionId } : {};
  }
  return {
    refreshToken: issued.refreshToken,
    ...(issued.currentSessionId ? { currentSessionId: issued.currentSessionId } : {}),
  };
}
