import type { Response } from 'express';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { verifyAppleIdentityToken } from '../apple/appleAuth.service';
import { verifyGoogleIdToken } from '../google/googleAuth.service';
import type { AuthRequest } from '../../middleware/auth';
import {
  issueLoginTokens,
  jwtPayloadFromAuthUser,
} from './authIssuance.service';
import { issuedRefreshJsonPayload } from '../../utils/refreshWebCookie';
import { revokeAllRefreshSessionsForUser } from './userRefreshSession.service';
import { needsDisplayNamePersist, resolveDisplayNameData } from '../user/userDisplayName.service';
import { UserMergeService } from '../user/userMerge.service';
import { ensureUserCityAssigned } from '../user-city-bootstrap.service';

export type OAuthLinkProvider = 'google' | 'apple';

const MERGE_REQUIRED_CODE = 'auth.oauthLinkMergeRequired';

function parseConfirmMerge(value: unknown): boolean {
  return value === true || value === 'true';
}

function throwMergeRequired(provider: OAuthLinkProvider): never {
  throw new ApiError(409, MERGE_REQUIRED_CODE, true, {
    code: MERGE_REQUIRED_CODE,
    provider,
  });
}

async function persistNameIfNeeded(
  userId: string,
  user: { firstName: string | null; lastName: string | null; nameIsSet: boolean }
) {
  const nameResolved = resolveDisplayNameData(user.firstName, user.lastName);
  if (!needsDisplayNamePersist(user, nameResolved)) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT_FIELDS,
    });
  }
  return prisma.user.update({
    where: { id: userId },
    data: {
      firstName: nameResolved.firstName ?? null,
      lastName: nameResolved.lastName ?? null,
      nameIsSet: nameResolved.nameIsSet,
    },
    select: PROFILE_SELECT_FIELDS,
  });
}

async function sendLinkResponse(
  req: AuthRequest,
  res: Response,
  userId: string,
  reissueTokens: boolean
) {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT_FIELDS,
  });
  if (!user) {
    throw new ApiError(404, 'errors.userNotFound');
  }
  user = await persistNameIfNeeded(userId, user);
  if (!user) {
    throw new ApiError(404, 'errors.userNotFound');
  }

  if (!reissueTokens) {
    res.json({ success: true, data: { user } });
    return;
  }

  user = await ensureUserCityAssigned(userId, req);
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);
  res.json({
    success: true,
    data: {
      user,
      token: issued.token,
      ...issuedRefreshJsonPayload(req, res, issued),
    },
  });
}

async function mergeOAuthSourceIntoSurvivor(
  survivorId: string,
  sourceId: string,
  req: AuthRequest,
  res: Response
) {
  if (!sourceId || sourceId === survivorId) {
    throw new ApiError(400, 'Cannot merge user into itself');
  }

  const source = await prisma.user.findUnique({
    where: { id: sourceId },
    select: { id: true, isActive: true },
  });
  if (!source) {
    throw new ApiError(404, 'errors.userNotFound');
  }
  if (!source.isActive) {
    throw new ApiError(403, 'auth.accountInactive');
  }

  await revokeAllRefreshSessionsForUser(sourceId);
  await UserMergeService.mergeUsers(survivorId, sourceId);
  await sendLinkResponse(req, res, survivorId, true);
}

export async function linkGoogleAccount(req: AuthRequest, res: Response) {
  const { idToken, confirmMerge: confirmMergeRaw } = req.body;
  const confirmMerge = parseConfirmMerge(confirmMergeRaw);

  if (!idToken) {
    throw new ApiError(400, 'auth.googleIdTokenRequired');
  }
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required', true, { code: 'auth.notAuthenticated' });
  }

  const googleToken = await verifyGoogleIdToken(idToken);
  const googleId = googleToken.sub;
  const survivorId = req.userId;

  const currentUser = await prisma.user.findUnique({
    where: { id: survivorId },
    select: { id: true, googleId: true, email: true },
  });
  if (!currentUser) {
    throw new ApiError(404, 'errors.userNotFound');
  }
  if (currentUser.googleId) {
    throw new ApiError(400, 'auth.googleAccountAlreadyLinked');
  }

  const existingGoogleUser = await prisma.user.findUnique({
    where: { googleId },
    select: { id: true },
  });

  if (existingGoogleUser && existingGoogleUser.id !== survivorId) {
    if (!confirmMerge) {
      throwMergeRequired('google');
    }
    await mergeOAuthSourceIntoSurvivor(survivorId, existingGoogleUser.id, req, res);
    return;
  }

  const emailToUse = googleToken.email || undefined;
  const updateData: Record<string, unknown> = {
    googleId,
    googleEmail: emailToUse,
    googleEmailVerified: emailToUse ? googleToken.email_verified || false : false,
  };

  if (emailToUse) {
    const existingEmail = await prisma.user.findUnique({ where: { email: emailToUse } });
    if (!existingEmail || existingEmail.id === survivorId) {
      if (!currentUser.email) {
        updateData.email = emailToUse;
      }
    }
  }

  await prisma.user.update({
    where: { id: survivorId },
    data: updateData,
  });

  await sendLinkResponse(req, res, survivorId, false);
}

export async function linkAppleAccount(req: AuthRequest, res: Response) {
  const { identityToken, nonce, confirmMerge: confirmMergeRaw } = req.body;
  const confirmMerge = parseConfirmMerge(confirmMergeRaw);

  if (!identityToken) {
    throw new ApiError(400, 'auth.identityTokenRequired');
  }
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required', true, { code: 'auth.notAuthenticated' });
  }

  const appleToken = await verifyAppleIdentityToken(identityToken, nonce);
  const appleSub = appleToken.sub;
  const survivorId = req.userId;

  const currentUser = await prisma.user.findUnique({
    where: { id: survivorId },
    select: { id: true, appleSub: true, email: true },
  });
  if (!currentUser) {
    throw new ApiError(404, 'errors.userNotFound');
  }
  if (currentUser.appleSub) {
    throw new ApiError(400, 'auth.appleAccountAlreadyLinked');
  }

  const existingAppleUser = await prisma.user.findUnique({
    where: { appleSub },
    select: { id: true },
  });

  if (existingAppleUser && existingAppleUser.id !== survivorId) {
    if (!confirmMerge) {
      throwMergeRequired('apple');
    }
    await mergeOAuthSourceIntoSurvivor(survivorId, existingAppleUser.id, req, res);
    return;
  }

  const emailToUse = appleToken.email || undefined;
  const updateData: Record<string, unknown> = {
    appleSub,
    appleEmail: emailToUse,
    appleEmailVerified: emailToUse ? appleToken.email_verified || false : false,
  };

  if (emailToUse) {
    const existingEmail = await prisma.user.findUnique({ where: { email: emailToUse } });
    if (!existingEmail || existingEmail.id === survivorId) {
      if (!currentUser.email) {
        updateData.email = emailToUse;
      }
    }
  }

  await prisma.user.update({
    where: { id: survivorId },
    data: updateData,
  });

  await sendLinkResponse(req, res, survivorId, false);
}
