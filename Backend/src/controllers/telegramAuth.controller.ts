import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import {
  assertLoginIssuanceAllowed,
  issueLoginTokens,
  jwtPayloadFromAuthUser,
} from '../services/auth/authIssuance.service';
import { revokeAllRefreshSessionsForUser } from '../services/auth/userRefreshSession.service';
import { issuedRefreshJsonPayload } from '../utils/refreshWebCookie';
import telegramBotService from '../services/telegram/bot.service';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import { NotificationPreferenceService } from '../services/notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import type { TelegramOtp } from '@prisma/client';
import { ensureUserCityAssigned } from '../services/user-city-bootstrap.service';
import { AuthRequest } from '../middleware/auth';
import {
  mergeOAuthLoginNames,
  needsDisplayNamePersist,
  resolveDisplayNameData,
} from '../services/user/userDisplayName.service';
import {
  getLinkKeyReplay,
  storeLinkKeyReplay,
} from '../services/telegram/linkKeyReplay.service';
import {
  parseRegistrationPrimarySport,
  registrationSportExplicitlyChosen,
  registrationSportUserFields,
} from '../services/auth/registrationSport.service';
import { UserMergeService } from '../services/user/userMerge.service';

const MERGE_REQUIRED_CODE = 'auth.oauthLinkMergeRequired';

function parseConfirmMerge(value: unknown): boolean {
  return value === true || value === 'true';
}

function throwTelegramMergeRequired(): never {
  throw new ApiError(409, MERGE_REQUIRED_CODE, true, {
    code: MERGE_REQUIRED_CODE,
    provider: 'telegram',
  });
}

async function completeTelegramAuth(
  otp: TelegramOtp,
  req: Request,
  language: string | undefined,
  primarySportRaw: unknown
): Promise<{ user: any; token: string; refreshToken?: string; currentSessionId?: string }> {
  assertLoginIssuanceAllowed(req);
  const actualTelegramId = otp.telegramId;
  let user = await prisma.user.findUnique({
    where: { telegramId: actualTelegramId },
    select: PROFILE_SELECT_FIELDS,
  });

  if (user) {
    if (!user.isActive) {
      throw new ApiError(403, 'auth.accountInactive');
    }
    const nameResolved = mergeOAuthLoginNames(
      user.firstName,
      user.lastName,
      otp.firstName ?? undefined,
      otp.lastName ?? undefined,
      user.nameIsSet
    );
    const updateData: any = {};
    if (otp.username && user.telegramUsername !== otp.username) {
      updateData.telegramUsername = otp.username;
    }
    if (language) {
      updateData.language = language;
    }
    if (needsDisplayNamePersist(user, nameResolved)) {
      updateData.firstName = nameResolved.firstName ?? null;
      updateData.lastName = nameResolved.lastName ?? null;
      updateData.nameIsSet = nameResolved.nameIsSet;
    }
    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: PROFILE_SELECT_FIELDS,
      });
    }
    user = await ensureUserCityAssigned(user.id, req);
    const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);
    await NotificationPreferenceService.ensurePreferenceForChannel(user.id, NotificationChannelType.TELEGRAM);
    return {
      user,
      token: issued.token,
      refreshToken: issued.refreshToken,
      currentSessionId: issued.currentSessionId,
    };
  }

  const newName = resolveDisplayNameData(otp.firstName, otp.lastName);
  const primarySport = parseRegistrationPrimarySport(primarySportRaw);
  user = await prisma.user.create({
    data: {
      telegramId: actualTelegramId,
      telegramUsername: otp.username,
      firstName: newName.firstName,
      lastName: newName.lastName ?? null,
      nameIsSet: newName.nameIsSet,
      language,
      ...registrationSportUserFields(primarySport, {
        primarySportIsSet: registrationSportExplicitlyChosen(primarySportRaw),
      }),
    },
    select: PROFILE_SELECT_FIELDS,
  });
  user = await ensureUserCityAssigned(user.id, req);
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);
  await NotificationPreferenceService.ensurePreferenceForChannel(user.id, NotificationChannelType.TELEGRAM);
  return {
    user,
    token: issued.token,
    refreshToken: issued.refreshToken,
    currentSessionId: issued.currentSessionId,
  };
}

async function mergeTelegramIntoUser(
  otp: TelegramOtp,
  linkUserId: string,
  req: Request,
  language: string | undefined,
  confirmMerge: boolean
): Promise<{ user: any; token: string; refreshToken?: string; currentSessionId?: string }> {
  const tgId = otp.telegramId;

  const conflicting = await prisma.user.findFirst({
    where: { telegramId: tgId, id: { not: linkUserId } },
    select: { id: true, isActive: true },
  });
  if (conflicting) {
    if (!confirmMerge) {
      throwTelegramMergeRequired();
    }
    if (!conflicting.isActive) {
      throw new ApiError(403, 'auth.accountInactive');
    }

    await revokeAllRefreshSessionsForUser(conflicting.id);
    await UserMergeService.mergeUsers(linkUserId, conflicting.id);

    let merged = await prisma.user.findUnique({
      where: { id: linkUserId },
      select: PROFILE_SELECT_FIELDS,
    });
    if (!merged) {
      throw new ApiError(404, 'User not found');
    }

    const postMergeUpdateData: any = {};
    if (otp.username && merged.telegramUsername !== otp.username) {
      postMergeUpdateData.telegramUsername = otp.username;
    }
    if (language) {
      postMergeUpdateData.language = language;
    }
    if (Object.keys(postMergeUpdateData).length > 0) {
      merged = await prisma.user.update({
        where: { id: linkUserId },
        data: postMergeUpdateData,
        select: PROFILE_SELECT_FIELDS,
      });
    }

    merged = await ensureUserCityAssigned(merged.id, req);
    const issued = await issueLoginTokens(jwtPayloadFromAuthUser(merged), req);
    await NotificationPreferenceService.ensurePreferenceForChannel(merged.id, NotificationChannelType.TELEGRAM);
    return {
      user: merged,
      token: issued.token,
      refreshToken: issued.refreshToken,
      currentSessionId: issued.currentSessionId,
    };
  }

  let user = await prisma.user.findUnique({
    where: { id: linkUserId },
    select: PROFILE_SELECT_FIELDS,
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'auth.accountInactive');
  }

  const nameResolved = mergeOAuthLoginNames(
    user.firstName,
    user.lastName,
    otp.firstName ?? undefined,
    otp.lastName ?? undefined,
    user.nameIsSet
  );
  const updateData: any = {
    telegramId: tgId,
    telegramUsername: otp.username ?? null,
  };
  if (language) {
    updateData.language = language;
  }
  if (needsDisplayNamePersist(user, nameResolved)) {
    updateData.firstName = nameResolved.firstName ?? null;
    updateData.lastName = nameResolved.lastName ?? null;
    updateData.nameIsSet = nameResolved.nameIsSet;
  }

  user = await prisma.user.update({
    where: { id: linkUserId },
    data: updateData,
    select: PROFILE_SELECT_FIELDS,
  });
  user = await ensureUserCityAssigned(user.id, req);
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);
  await NotificationPreferenceService.ensurePreferenceForChannel(user.id, NotificationChannelType.TELEGRAM);
  return {
    user,
    token: issued.token,
    refreshToken: issued.refreshToken,
    currentSessionId: issued.currentSessionId,
  };
}

export const verifyTelegramOtp = asyncHandler(async (req: Request, res: Response) => {
  const { code, language, primarySport } = req.body;
  if (!code) {
    throw new ApiError(400, 'auth.codeRequired');
  }
  const otp = await telegramBotService.verifyCode(code);
  if (!otp) {
    throw new ApiError(401, 'auth.invalidCode');
  }
  const { user, token, refreshToken, currentSessionId } = await completeTelegramAuth(
    otp,
    req,
    language,
    primarySport,
  );
  res.json({
    success: true,
    data: {
      user,
      token,
      ...issuedRefreshJsonPayload(req, res, { refreshToken, currentSessionId }),
    },
  });
});

export const verifyTelegramLinkKey = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { key, language, primarySport, confirmMerge: confirmMergeRaw } = req.body;
  const confirmMerge = parseConfirmMerge(confirmMergeRaw);
  if (!key || typeof key !== 'string' || key.length < 20) {
    throw new ApiError(400, 'auth.codeRequired');
  }

  const replay = getLinkKeyReplay(key);
  if (replay) {
    res.json({
      success: true,
      data: {
        user: replay.user,
        token: replay.token,
        ...issuedRefreshJsonPayload(req, res, {
          refreshToken: replay.refreshToken,
          currentSessionId: replay.currentSessionId,
        }),
      },
    });
    return;
  }

  const otp = await telegramBotService.verifyLinkKey(key, { consume: false });
  if (!otp) {
    throw new ApiError(401, 'auth.invalidCode');
  }
  if (otp.linkUserId) {
    if (!req.userId) {
      throw new ApiError(401, 'auth.telegramLinkRequiresLogin');
    }
    if (req.userId !== otp.linkUserId) {
      throw new ApiError(403, 'auth.telegramLinkWrongAccount');
    }
    const merged = await mergeTelegramIntoUser(otp, otp.linkUserId, req, language, confirmMerge);
    await telegramBotService.consumeTelegramOtp(otp);
    storeLinkKeyReplay(key, {
      user: merged.user,
      token: merged.token,
      refreshToken: merged.refreshToken,
      currentSessionId: merged.currentSessionId,
    });
    res.json({
      success: true,
      data: {
        user: merged.user,
        token: merged.token,
        ...issuedRefreshJsonPayload(req, res, {
          refreshToken: merged.refreshToken,
          currentSessionId: merged.currentSessionId,
        }),
      },
    });
    return;
  }
  const { user, token, refreshToken, currentSessionId } = await completeTelegramAuth(
    otp,
    req,
    language,
    primarySport,
  );
  await telegramBotService.consumeTelegramOtp(otp);
  storeLinkKeyReplay(key, { user, token, refreshToken, currentSessionId });
  res.json({
    success: true,
    data: {
      user,
      token,
      ...issuedRefreshJsonPayload(req, res, { refreshToken, currentSessionId }),
    },
  });
});
