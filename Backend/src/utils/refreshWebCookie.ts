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

/**
 * A refresh credential received from a cookie must only ever be returned as a cookie.
 * This deliberately ignores a spoofable platform header for cookie-authenticated refreshes.
 */
export function shouldUseCookieForRefreshResponse(req: Request): boolean {
  const hasBodyToken = typeof req.body?.refreshToken === 'string' && !!req.body.refreshToken.trim();
  return config.refreshTokenEnabled && config.refreshWebHttpOnlyCookie &&
    (shouldUseWebRefreshHttpOnlyCookie(req) || !hasBodyToken);
}

function decodeCookieValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseNamedCookieValues(header: string | undefined, name: string): string[] {
  if (!header) return [];
  const values: string[] = [];
  const seen = new Set<string>();
  for (const seg of header.split(';')) {
    const idx = seg.indexOf('=');
    if (idx === -1) continue;
    const k = seg.slice(0, idx).trim();
    if (k !== name) continue;
    const value = decodeCookieValue(seg.slice(idx + 1).trim()).trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

export function readRefreshTokenCandidatesFromRequest(req: Request): string[] {
  const body = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  const cookies = parseNamedCookieValues(req.headers.cookie, config.refreshCookieName);
  if (
    cookies.length > 0 &&
    config.refreshWebHttpOnlyCookie &&
    getClientPlatform(req) === 'web'
  ) {
    return cookies;
  }
  if (body && !cookies.includes(body)) return [body, ...cookies];
  if (body) return [body, ...cookies.filter((value) => value !== body)];
  return cookies;
}

export function readRefreshTokenFromRequest(req: Request): string {
  const candidates = readRefreshTokenCandidatesFromRequest(req);
  return candidates[candidates.length - 1] ?? '';
}

function buildCookiePair(
  value: string,
  maxAge: number,
  domain: string | null,
  path: string = config.refreshCookiePath,
): string {
  let sameSite = config.refreshCookieSameSite;
  let secure = config.refreshCookieSecure;
  if (sameSite === 'none' && !secure) secure = true;
  const ss = sameSite.charAt(0).toUpperCase() + sameSite.slice(1);
  const parts = [
    `${encodeURIComponent(config.refreshCookieName)}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    'HttpOnly',
    `Max-Age=${maxAge}`,
    `SameSite=${ss}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
}

function cookieDomainsToExpire(req?: Request): Array<string | null> {
  const domains = new Set<string | null>([null]);
  if (config.refreshCookieDomain) domains.add(config.refreshCookieDomain);
  const hostHeader = req?.hostname || (typeof req?.headers?.host === 'string' ? req.headers.host : '');
  const host = hostHeader.split(':')[0]?.trim() ?? '';
  if (host && host !== 'localhost' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    domains.add(host);
    domains.add(`.${host.replace(/^\./, '')}`);
  }
  return [...domains];
}

function cookiePathsToExpire(): string[] {
  const paths = new Set<string>([config.refreshCookiePath, '/']);
  return [...paths];
}

export function clearRefreshTokenCookie(res: Response, req?: Request): void {
  for (const path of cookiePathsToExpire()) {
    for (const domain of cookieDomainsToExpire(req)) {
      res.append('Set-Cookie', buildCookiePair('', 0, domain, path));
    }
  }
}

export function setRefreshTokenCookie(res: Response, rawToken: string): void {
  const maxAge = expiresInToMaxAgeSeconds(config.refreshTokenExpiresIn);
  res.append('Set-Cookie', buildCookiePair(rawToken, maxAge, config.refreshCookieDomain));
}

export function issuedRefreshJsonPayload(
  req: Request,
  res: Response,
  issued: { refreshToken?: string; currentSessionId?: string }
): { refreshToken?: string; currentSessionId?: string } {
  if (!issued.refreshToken) {
    if (shouldUseWebRefreshHttpOnlyCookie(req)) clearRefreshTokenCookie(res, req);
    return {};
  }
  if (shouldUseWebRefreshHttpOnlyCookie(req)) {
    setRefreshTokenCookie(res, issued.refreshToken);
    if (config.refreshWebHttpOnlyJsonBody) {
      return {
        refreshToken: issued.refreshToken,
        ...(issued.currentSessionId ? { currentSessionId: issued.currentSessionId } : {}),
      };
    }
    return issued.currentSessionId ? { currentSessionId: issued.currentSessionId } : {};
  }
  return {
    refreshToken: issued.refreshToken,
    ...(issued.currentSessionId ? { currentSessionId: issued.currentSessionId } : {}),
  };
}
