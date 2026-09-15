import { randomBytes } from 'node:crypto';

export const LINK_TO_APP_AID_RE = /^[a-zA-Z0-9]{8,32}$/;
export const LINK_TO_APP_AID_COOKIE = 'bandeja_aid';
export const LINK_TO_APP_AID_MAX_AGE_SEC = 365 * 24 * 60 * 60;

export function isLinkToAppAid(value: string): boolean {
  return LINK_TO_APP_AID_RE.test(value);
}

export function createLinkToAppAid(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function parseAidCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName !== LINK_TO_APP_AID_COOKIE) continue;
    const value = rest.join('=').trim();
    return isLinkToAppAid(value) ? value : null;
  }
  return null;
}

export function aidSetCookieHeader(aid: string, secure: boolean): string {
  const flags = [`Path=/`, `Max-Age=${LINK_TO_APP_AID_MAX_AGE_SEC}`, `SameSite=Lax`];
  if (secure) flags.push('Secure');
  return `${LINK_TO_APP_AID_COOKIE}=${aid}; ${flags.join('; ')}`;
}
