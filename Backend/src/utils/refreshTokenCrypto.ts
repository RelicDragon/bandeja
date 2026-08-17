import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateOpaqueRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

const REPLAY_CIPHER_VERSION = 'v1';

function replayEncryptionKey(secret: string): Buffer {
  return createHash('sha256')
    .update('bandeja:refresh-replay:v1\0', 'utf8')
    .update(secret, 'utf8')
    .digest();
}

/** Encrypt the replacement refresh credential so an identical request can replay its response. */
export function encryptRefreshReplayToken(rawToken: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', replayEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    REPLAY_CIPHER_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptRefreshReplayToken(payload: string, secret: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw, extra] = payload.split('.');
  if (
    version !== REPLAY_CIPHER_VERSION ||
    !ivRaw ||
    !tagRaw ||
    !ciphertextRaw ||
    extra !== undefined
  ) {
    throw new Error('Invalid refresh replay payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    replayEncryptionKey(secret),
    Buffer.from(ivRaw, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
