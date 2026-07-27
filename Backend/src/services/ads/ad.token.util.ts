import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '@prisma/client';
import { config } from '../../config/env';
import prisma from '../../config/database';

export const AD_CLICK_URL_AD_TOKEN_PARAM = 'ad_token';

/** Lifetime for a user↔campaign credential (no mid-life rotation). */
export const AD_CLICK_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const MIN_TOKEN_LEN = 16;

export type AdClickTokenClaims = {
  userId: string;
  campaignId: string;
};

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.AD_CLICK_TOKEN_SECRET?.trim() || config.jwtSecret;
  if (!raw) {
    throw new Error('AD_CLICK_TOKEN_SECRET or JWT_SECRET is required for ad_token');
  }
  cachedKey = createHash('sha256').update(`ad-click-token-v3:${raw}`, 'utf8').digest();
  return cachedKey;
}

function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex — same style as PushReplyToken / refresh sessions. */
export function hashAdClickToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function encryptRawToken(raw: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptRawToken(encoded: string): string | null {
  try {
    const buf = Buffer.from(encoded, 'base64url');
    if (buf.length <= IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function isUsable(row: { expiresAt: Date; revokedAt: Date | null }, now: Date): boolean {
  if (row.revokedAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}

function hashesMatch(expectedHex: string, candidatePlaintext: string): boolean {
  const candidateHash = hashAdClickToken(candidatePlaintext);
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function readReusableToken(
  userId: string,
  campaignId: string,
  now: Date
): Promise<string | null> {
  const existing = await prisma.adClickToken.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });
  if (!existing || !isUsable(existing, now)) return null;
  const raw = decryptRawToken(existing.tokenCipher);
  if (!raw || !hashesMatch(existing.tokenHash, raw)) return null;
  return raw;
}

async function persistToken(
  userId: string,
  campaignId: string,
  raw: string,
  now: Date
): Promise<void> {
  const tokenHash = hashAdClickToken(raw);
  const tokenCipher = encryptRawToken(raw);
  const expiresAt = new Date(now.getTime() + AD_CLICK_TOKEN_TTL_MS);

  await prisma.adClickToken.upsert({
    where: { userId_campaignId: { userId, campaignId } },
    create: {
      tokenHash,
      tokenCipher,
      userId,
      campaignId,
      expiresAt,
      revokedAt: null,
    },
    update: {
      tokenHash,
      tokenCipher,
      expiresAt,
      createdAt: now,
      revokedAt: null,
    },
  });
}

/**
 * Same user + campaign → same opaque bearer until expiry or revoke.
 *
 * - No user cuid in URL
 * - DB: tokenHash (verify) + tokenCipher (re-issue only)
 * - No mid-life rotation (avoids killing bookmarked / in-progress landing URLs)
 * - Concurrent-safe (retry on unique race)
 */
export async function mintAdClickToken(claims: AdClickTokenClaims): Promise<string> {
  const userId = claims.userId.trim();
  const campaignId = claims.campaignId.trim();
  if (!userId || !campaignId) {
    throw new Error('ad_token requires userId and campaignId');
  }

  const now = new Date();
  const reusable = await readReusableToken(userId, campaignId, now);
  if (reusable) return reusable;

  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = newOpaqueToken();
    try {
      await persistToken(userId, campaignId, raw, now);
      return raw;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const won = await readReusableToken(userId, campaignId, new Date());
        if (won) return won;
        continue;
      }
      throw err;
    }
  }

  throw new Error('ad_token mint failed after concurrent retries');
}

export async function verifyAdClickToken(
  token: string | null | undefined
): Promise<AdClickTokenClaims | null> {
  if (!token || typeof token !== 'string') return null;
  const raw = token.trim();
  if (raw.length < MIN_TOKEN_LEN) return null;

  const tokenHash = hashAdClickToken(raw);
  const row = await prisma.adClickToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (!hashesMatch(row.tokenHash, raw)) return null;
  if (!isUsable(row, new Date())) return null;

  return { userId: row.userId, campaignId: row.campaignId };
}

export async function revokeAdClickToken(claims: AdClickTokenClaims): Promise<void> {
  const userId = claims.userId.trim();
  const campaignId = claims.campaignId.trim();
  if (!userId || !campaignId) return;
  await prisma.adClickToken.updateMany({
    where: { userId, campaignId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Best-effort cleanup for expired/revoked rows (optional ops / cron). */
export async function purgeExpiredAdClickTokens(now = new Date()): Promise<number> {
  const result = await prisma.adClickToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
    },
  });
  return result.count;
}
