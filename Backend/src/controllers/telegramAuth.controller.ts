import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import telegramBotService from '../services/telegram/bot.service';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import { NotificationPreferenceService } from '../services/notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import type { TelegramOtp } from '@prisma/client';
import { ensureUserCityAssigned } from '../services/user-city-bootstrap.service';
import {
  mergeOAuthLoginNames,
  needsDisplayNamePersist,
  resolveDisplayNameData,
} from '../services/user/userDisplayName.service';

async function completeTelegramAuth(
  otp: TelegramOtp,
  req: Request,
  language: string | undefined
): Promise<{ user: any; token: string }> {
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
    const token = generateToken({ userId: user.id, telegramId: actualTelegramId });
    await NotificationPreferenceService.ensurePreferenceForChannel(user.id, NotificationChannelType.TELEGRAM);
    return { user, token };
  }

  const newName = resolveDisplayNameData(otp.firstName, otp.lastName);
  user = await prisma.user.create({
    data: {
      telegramId: actualTelegramId,
      telegramUsername: otp.username,
      firstName: newName.firstName,
      lastName: newName.lastName ?? null,
      nameIsSet: newName.nameIsSet,
      language,
    },
    select: PROFILE_SELECT_FIELDS,
  });
  user = await ensureUserCityAssigned(user.id, req);
  const token = generateToken({ userId: user.id, telegramId: actualTelegramId });
  await NotificationPreferenceService.ensurePreferenceForChannel(user.id, NotificationChannelType.TELEGRAM);
  return { user, token };
}

export const verifyTelegramOtp = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const { code, language } = req.body;
  if (!code) {
    throw new ApiError(400, 'auth.codeRequired');
  }
  const otp = await telegramBotService.verifyCode(code);
  if (!otp) {
    throw new ApiError(401, 'auth.invalidCode');
  }
  const { user, token } = await completeTelegramAuth(otp, req, language);
  res.json({ success: true, data: { user, token } });
});

export const verifyTelegramLinkKey = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const { key, language } = req.body;
  if (!key || typeof key !== 'string' || key.length < 20) {
    throw new ApiError(400, 'auth.codeRequired');
  }
  const otp = await telegramBotService.verifyLinkKey(key);
  if (!otp) {
    throw new ApiError(401, 'auth.invalidCode');
  }
  const { user, token } = await completeTelegramAuth(otp, req, language);
  res.json({ success: true, data: { user, token } });
});

