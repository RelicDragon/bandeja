import { parseExpiresInToMs } from '../config/jwtAuthConfig';

export { parseExpiresInToMs };

export function expiresInToDate(expiresIn: string): Date {
  return new Date(Date.now() + parseExpiresInToMs(expiresIn));
}

export function expiresInToMaxAgeSeconds(expiresIn: string): number {
  const d = expiresInToDate(expiresIn);
  return Math.max(60, Math.floor((d.getTime() - Date.now()) / 1000));
}
