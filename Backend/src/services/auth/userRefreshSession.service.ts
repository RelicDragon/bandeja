import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  decryptRefreshReplayToken,
  encryptRefreshReplayToken,
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from '../../utils/refreshTokenCrypto';
import { expiresInToDate } from '../../utils/tokenExpiry';
import { config } from '../../config/env';
import {
  issuedRefreshCredentials,
  readRefreshClientMetadata,
  requireActiveRefreshUser,
  type IssuedRefreshCredentials,
  type RefreshClientMetadata,
} from './refreshSessionCredentials';
import { refreshAuthError } from './refreshSessionErrors';

const REFRESH_SERIALIZATION_MAX_ATTEMPTS = 5;

const refreshTransactionOptions = {
  maxWait: 5000,
  timeout: 15000,
} as const;

type LockedRefreshSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  rotationFamilyId: string;
  rotationRequestId: string | null;
  replacementTokenCiphertext: string | null;
};

export async function createUserRefreshSession(
  userId: string,
  req: Request
): Promise<{ refreshToken: string; sessionId: string }> {
  const raw = generateOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(raw);
  const rotationFamilyId = randomUUID();
  const metadata = await readRefreshClientMetadata(req);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`);
    const created = await tx.userRefreshSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt: expiresInToDate(config.refreshTokenExpiresIn),
        rotationFamilyId,
        ...metadata,
      },
    });
    const active = await tx.userRefreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    const excess = active.slice(config.authMaxActiveSessionsPerUser).map((session) => session.id);
    if (excess.length > 0) {
      await tx.userRefreshSession.updateMany({
        where: { id: { in: excess }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return created;
  }, refreshTransactionOptions);
  return { refreshToken: raw, sessionId: row.id };
}

export function buildActiveRefreshSessionUpdate(input: {
  now: Date;
  expiresAt: Date;
} & RefreshClientMetadata) {
  return {
    lastUsedAt: input.now,
    expiresAt: input.expiresAt,
    platform: input.platform,
    userAgent: input.userAgent,
    ip: input.ip,
  };
}

async function lockSessionByHash(
  tx: Prisma.TransactionClient,
  hash: string
): Promise<LockedRefreshSession | undefined> {
  const locked = await tx.$queryRaw<LockedRefreshSession[]>(
    Prisma.sql`
      SELECT id, "userId", "tokenHash", "expiresAt", "revokedAt", "replacedBySessionId",
             "rotationFamilyId", "rotationRequestId", "replacementTokenCiphertext"
      FROM "user_refresh_sessions"
      WHERE "tokenHash" = ${hash}
      FOR UPDATE
    `
  );
  return locked[0];
}

async function replayLiveSuccessor(
  tx: Prisma.TransactionClient,
  row: LockedRefreshSession
): Promise<IssuedRefreshCredentials> {
  if (!row.replacedBySessionId || !row.replacementTokenCiphertext) {
    refreshAuthError('auth.refreshInvalid');
  }
  const successor = await tx.userRefreshSession.findUnique({
    where: { id: row.replacedBySessionId },
    select: {
      id: true,
      userId: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
      replacedBySessionId: true,
    },
  });
  if (!successor || successor.userId !== row.userId || successor.expiresAt < new Date()) {
    refreshAuthError('auth.refreshInvalid');
  }
  if (successor.revokedAt) {
    refreshAuthError(successor.replacedBySessionId ? 'auth.refreshReused' : 'auth.refreshInvalid');
  }
  const replayToken = decryptRefreshReplayToken(row.replacementTokenCiphertext, config.jwtSecret);
  if (hashRefreshToken(replayToken) !== successor.tokenHash) {
    throw new Error('Refresh replay payload does not match successor session');
  }
  const user = await requireActiveRefreshUser(tx, row.userId);
  return issuedRefreshCredentials(user, replayToken, successor.id);
}

async function touchActiveSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  user: Awaited<ReturnType<typeof requireActiveRefreshUser>>,
  refreshToken: string,
  now: Date,
  expiresAt: Date,
  metadata: RefreshClientMetadata
): Promise<IssuedRefreshCredentials> {
  await tx.userRefreshSession.update({
    where: { id: sessionId },
    data: buildActiveRefreshSessionUpdate({ now, expiresAt, ...metadata }),
  });
  return issuedRefreshCredentials(user, refreshToken, sessionId);
}

export async function resolvePresentedRefreshToken(candidates: string[]): Promise<string> {
  const unique = [...new Set(candidates.map((token) => token.trim()).filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  const hashed = unique.map((token) => ({ token, hash: hashRefreshToken(token) }));
  const rows = await prisma.userRefreshSession.findMany({
    where: { tokenHash: { in: hashed.map((item) => item.hash) } },
    select: {
      tokenHash: true,
      revokedAt: true,
      expiresAt: true,
      replacedBySessionId: true,
      replacementTokenCiphertext: true,
    },
  });
  const byHash = new Map(rows.map((row) => [row.tokenHash, row]));
  const now = new Date();
  const live = hashed.find((item) => {
    const row = byHash.get(item.hash);
    return !!row && !row.revokedAt && row.expiresAt > now;
  });
  if (live) return live.token;
  const replayable = hashed.find((item) => {
    const row = byHash.get(item.hash);
    return !!row?.revokedAt && !!row.replacedBySessionId && !!row.replacementTokenCiphertext;
  });
  if (replayable) return replayable.token;
  return unique[unique.length - 1];
}

export async function refreshActiveSession(
  refreshTokenRaw: string,
  req: Request,
  refreshRequestId?: string | null
): Promise<IssuedRefreshCredentials> {
  const hash = hashRefreshToken(refreshTokenRaw.trim());
  const metadata = await readRefreshClientMetadata(req);

  for (let attempt = 0; attempt < REFRESH_SERIALIZATION_MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const row = await lockSessionByHash(tx, hash);
        if (!row) refreshAuthError('auth.refreshInvalid');
        if (row.revokedAt) return replayLiveSuccessor(tx, row);
        if (row.expiresAt < new Date()) refreshAuthError('auth.refreshExpired');

        const user = await requireActiveRefreshUser(tx, row.userId);
        const now = new Date();
        const expiresAt = expiresInToDate(config.refreshTokenExpiresIn);
        const presentedToken = refreshTokenRaw.trim();

        if (!refreshRequestId) {
          return touchActiveSession(tx, row.id, user, presentedToken, now, expiresAt, metadata);
        }

        const predecessorForSameRequest = await tx.userRefreshSession.findFirst({
          where: {
            replacedBySessionId: row.id,
            rotationRequestId: refreshRequestId,
          },
          select: { id: true },
        });
        if (predecessorForSameRequest) {
          return touchActiveSession(tx, row.id, user, presentedToken, now, expiresAt, metadata);
        }

        const replacementToken = generateOpaqueRefreshToken();
        const successor = await tx.userRefreshSession.create({
          data: {
            userId: row.userId,
            tokenHash: hashRefreshToken(replacementToken),
            expiresAt,
            rotationFamilyId: row.rotationFamilyId,
            ...metadata,
          },
        });
        await tx.userRefreshSession.update({
          where: { id: row.id },
          data: {
            lastUsedAt: now,
            revokedAt: now,
            replacedBySessionId: successor.id,
            rotationRequestId: refreshRequestId,
            replacementTokenCiphertext: encryptRefreshReplayToken(replacementToken, config.jwtSecret),
            ...metadata,
          },
        });
        return issuedRefreshCredentials(user, replacementToken, successor.id);
      }, refreshTransactionOptions);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const isSerializationConflict =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034';
      if (isSerializationConflict && attempt + 1 < REFRESH_SERIALIZATION_MAX_ATTEMPTS) {
        const base = 20 * (attempt + 1);
        await new Promise((r) => setTimeout(r, base + Math.floor(Math.random() * 60)));
        continue;
      }
      if (isSerializationConflict) refreshAuthError('auth.refreshBusy', 503);
      throw e;
    }
  }

  refreshAuthError('auth.refreshBusy', 503);
}

export async function purgeOldRefreshSessions(now = new Date()): Promise<number> {
  const retentionCutoff = new Date(
    now.getTime() - config.authSessionRetentionDays * 24 * 60 * 60 * 1000
  );
  const result = await prisma.userRefreshSession.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: retentionCutoff } }, { revokedAt: { lt: retentionCutoff } }],
    },
  });
  return result.count;
}

export async function revokeByRawToken(refreshTokenRaw: string | undefined): Promise<void> {
  if (!refreshTokenRaw?.trim()) return;
  await revokePresentedRefreshTokens([refreshTokenRaw]);
}

export async function revokePresentedRefreshTokens(tokens: string[]): Promise<void> {
  const hashes = [...new Set(tokens.map((token) => token.trim()).filter(Boolean).map(hashRefreshToken))];
  if (hashes.length === 0) return;
  await prisma.userRefreshSession.updateMany({
    where: { tokenHash: { in: hashes }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshSessionsForUser(userId: string): Promise<void> {
  await prisma.userRefreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeSessionByIdForUser(userId: string, sessionId: string): Promise<void> {
  const r = await prisma.userRefreshSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (r.count === 0) {
    throw new ApiError(404, 'errors.notFound');
  }
}

export async function activeUserRefreshMatchesSessionId(
  userId: string,
  sessionId: string,
  refreshTokenRaw: string
): Promise<boolean> {
  if (!refreshTokenRaw.trim()) return false;
  const h = hashRefreshToken(refreshTokenRaw.trim());
  const row = await prisma.userRefreshSession.findFirst({
    where: { userId, id: sessionId, tokenHash: h, revokedAt: null },
    select: { id: true },
  });
  return !!row;
}

export async function listSessionsForUser(userId: string) {
  return prisma.userRefreshSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      deviceLabel: true,
      platform: true,
      userAgent: true,
      ip: true,
    },
  });
}
