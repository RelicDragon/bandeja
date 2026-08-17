import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { generateShortAccessToken } from '../../utils/jwt';
import { getClientPlatform } from '../../utils/clientVersion';
import { getClientIp } from '../ipLocation.service';
import { enrichProfileUser } from '../user/userSportProfile.service';
import { jwtPayloadFromAuthUser } from './authIssuance.service';
import { refreshAuthError } from './refreshSessionErrors';

export type RefreshSessionUser = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT_FIELDS }>;

export type IssuedRefreshCredentials = {
  token: string;
  refreshToken: string;
  user: unknown;
  currentSessionId: string;
};

export type RefreshClientMetadata = {
  platform: string;
  userAgent: string | null;
  ip: string | null;
};

export function issuedRefreshCredentials(
  user: RefreshSessionUser,
  refreshToken: string,
  currentSessionId: string
): IssuedRefreshCredentials {
  return {
    token: generateShortAccessToken(jwtPayloadFromAuthUser(user)),
    refreshToken,
    user: enrichProfileUser(user),
    currentSessionId,
  };
}

export async function requireActiveRefreshUser(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<RefreshSessionUser> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT_FIELDS,
  });
  if (!user?.isActive) refreshAuthError('auth.userInactive');
  return user;
}

export async function readRefreshClientMetadata(req: Request): Promise<RefreshClientMetadata> {
  const ip = await getClientIp(req).catch(() => null);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null;
  return {
    platform: getClientPlatform(req),
    userAgent: ua,
    ip: ip ? ip.slice(0, 64) : null,
  };
}
