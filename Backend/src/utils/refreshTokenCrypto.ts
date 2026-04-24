import { createHash, randomBytes } from 'crypto';

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateOpaqueRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}
