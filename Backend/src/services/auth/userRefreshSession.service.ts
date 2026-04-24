import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hashRefreshToken, generateOpaqueRefreshToken } from '../../utils/refreshTokenCrypto';
import { expiresInToDate } from '../../utils/tokenExpiry';
import { config } from '../../config/env';
import { getClientPlatform } from '../../utils/clientVersion';
import { getClientIp } from '../ipLocation.service';
import { generateShortAccessToken } from '../../utils/jwt';
import { jwtPayloadFromAuthUser } from './authIssuance.service';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';

export async function createUserRefreshSession(
  userId: string,
  req: Request
): Promise<{ refreshToken: string; sessionId: string }> {
  const raw = generateOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(raw);
  const rotationFamilyId = randomUUID();
  const ip = await getClientIp(req).catch(() => null);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null;
  const row = await prisma.userRefreshSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt: expiresInToDate(config.refreshTokenExpiresIn),
      rotationFamilyId,
      platform: getClientPlatform(req),
      userAgent: ua,
      ip: ip ? ip.slice(0, 64) : null,
    },
  });
  return { refreshToken: raw, sessionId: row.id };
}

export async function refreshWithRotation(
  refreshTokenRaw: string,
  req: Request
): Promise<{ token: string; refreshToken: string; user: unknown; currentSessionId: string }> {
  const hash = hashRefreshToken(refreshTokenRaw.trim());
  try {
    return await prisma.$transaction(
      async (tx) => {
        const row = await tx.userRefreshSession.findUnique({ where: { tokenHash: hash } });
        if (!row) {
          throw new ApiError(401, 'auth.refreshInvalid', true, { code: 'auth.refreshInvalid' });
        }
        if (row.revokedAt) {
          if (row.replacedBySessionId) {
            throw new ApiError(401, 'auth.refreshInvalid', true, { code: 'auth.refreshInvalid' });
          }
          throw new ApiError(401, 'auth.refreshInvalid', true, { code: 'auth.refreshInvalid' });
        }
        if (row.expiresAt < new Date()) {
          throw new ApiError(401, 'auth.refreshExpired', true, { code: 'auth.refreshExpired' });
        }
        const user = await tx.user.findUnique({
          where: { id: row.userId },
          select: PROFILE_SELECT_FIELDS,
        });
        if (!user?.isActive) {
          throw new ApiError(401, 'auth.refreshInvalid', true, { code: 'auth.refreshInvalid' });
        }
        const newRaw = generateOpaqueRefreshToken();
        const newHash = hashRefreshToken(newRaw);
        const ip = await getClientIp(req).catch(() => null);
        const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null;
        const newRow = await tx.userRefreshSession.create({
          data: {
            userId: row.userId,
            tokenHash: newHash,
            expiresAt: expiresInToDate(config.refreshTokenExpiresIn),
            rotationFamilyId: row.rotationFamilyId,
            platform: getClientPlatform(req),
            userAgent: ua,
            ip: ip ? ip.slice(0, 64) : null,
          },
        });
        await tx.userRefreshSession.update({
          where: { id: row.id },
          data: { revokedAt: new Date(), replacedBySessionId: newRow.id, lastUsedAt: new Date() },
        });
        const token = generateShortAccessToken(jwtPayloadFromAuthUser(user));
        return { token, refreshToken: newRaw, user, currentSessionId: newRow.id };
      },
      {
        maxWait: 5000,
        timeout: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
      throw new ApiError(401, 'auth.refreshInvalid', true, { code: 'auth.refreshInvalid' });
    }
    throw e;
  }
}

export async function revokeByRawToken(refreshTokenRaw: string | undefined): Promise<void> {
  if (!refreshTokenRaw?.trim()) return;
  const h = hashRefreshToken(refreshTokenRaw.trim());
  await prisma.userRefreshSession.updateMany({
    where: { tokenHash: h, revokedAt: null },
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

/** True when `raw` is the active refresh token for this user+session row (cookie or body). */
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
