import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export class TokenDecryptError extends Error {
  constructor(cause?: unknown) {
    super('Unable to decrypt stored token');
    this.name = 'TokenDecryptError';
    if (cause instanceof Error) this.cause = cause;
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.BOOKTIME_TOKEN_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!raw) {
    throw new Error('BOOKTIME_TOKEN_ENCRYPTION_KEY or JWT_SECRET is required for token encryption');
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptToken(encoded: string): string {
  const key = encryptionKey();
  try {
    const buf = Buffer.from(encoded, 'base64url');
    if (buf.length <= IV_LEN + TAG_LEN) {
      throw new TokenDecryptError();
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    if (err instanceof TokenDecryptError) throw err;
    throw new TokenDecryptError(err);
  }
}

export function tryDecryptToken(encoded: string): string | null {
  try {
    return decryptToken(encoded);
  } catch (err) {
    if (err instanceof TokenDecryptError) return null;
    throw err;
  }
}
