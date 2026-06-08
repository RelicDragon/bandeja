import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { LegacyJwtVerifyRejectedError, verifyToken } from '../utils/jwt';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { USER_SELECT_FIELDS } from '../utils/constants';

export const AUTH_USER_SELECT = {
  ...USER_SELECT_FIELDS,
  phone: true,
  email: true,
  telegramId: true,
  googleId: true,
  appleSub: true,
  isActive: true,
  isAdmin: true,
  isTrainer: true,
  currentCityId: true,
  lastUserIP: true,
} as const;

function tokenFromHeader(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
}

function tokenFromQuery(req: Request): string | undefined {
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return undefined;
}

export function extractBearerToken(req: Request): string | undefined {
  return tokenFromHeader(req) ?? tokenFromQuery(req);
}

export function extractBearerTokenFromHeader(req: Request): string | undefined {
  return tokenFromHeader(req);
}

export function mapJwtError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof LegacyJwtVerifyRejectedError) {
    const endedAt = config.legacyJwtIssuanceEndAt;
    return new ApiError(401, 'auth.clientUpgradeRequired', true, {
      code: 'auth.clientUpgradeRequired',
      minClientVersion: config.minClientVersionForRefresh,
      ...(endedAt && { legacyJwtIssuanceEndedAt: endedAt.toISOString() }),
    });
  }
  if (error instanceof jwt.TokenExpiredError) {
    return new ApiError(401, 'auth.accessExpired', true, { code: 'auth.accessExpired' });
  }
  if (error instanceof jwt.JsonWebTokenError) {
    return new ApiError(401, 'auth.invalidToken', true, { code: 'auth.invalidToken' });
  }
  return new ApiError(401, 'auth.invalidToken', true, { code: 'auth.invalidToken' });
}

type AuthUser = Prisma.UserGetPayload<{ select: typeof AUTH_USER_SELECT }>;

type LoadActiveUserOptions =
  | { select?: typeof AUTH_USER_SELECT }
  | { select: 'full' };

export async function loadActiveUser(
  token: string,
  options?: LoadActiveUserOptions
): Promise<AuthUser | Prisma.UserGetPayload<object>> {
  const decoded = verifyToken(token);
  const user =
    options?.select === 'full'
      ? await prisma.user.findUnique({ where: { id: decoded.userId } })
      : await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: options?.select ?? AUTH_USER_SELECT,
        });

  if (!user) {
    throw new ApiError(401, 'User not found or inactive', true, { code: 'auth.userNotFound' });
  }
  if (!user.isActive) {
    throw new ApiError(401, 'User not found or inactive', true, { code: 'auth.userInactive' });
  }
  return user;
}
