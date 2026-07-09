import { randomUUID } from 'crypto';
import type { TelegramOtp } from '@prisma/client';
import { Bot } from 'grammy';
import prisma from '../../config/database';
import { deleteOtpMessages } from './cleanup.service';

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function generateActiveUniqueOTP(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateOTP();
    const existing = await prisma.telegramOtp.findFirst({
      where: {
        code,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!existing) return code;
  }

  return generateOTP();
}

export function generateLinkKey(): string {
  return randomUUID();
}

export async function consumeTelegramOtp(otp: TelegramOtp, bot: Bot | null) {
  await deleteOtpMessages(otp, bot);

  await prisma.telegramOtp.delete({
    where: { id: otp.id },
  });
}

export async function verifyCode(code: string, bot: Bot | null) {
  const otp = await prisma.telegramOtp.findFirst({
    where: {
      code,
      linkUserId: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!otp) {
    return null;
  }

  await consumeTelegramOtp(otp, bot);

  return otp;
}

export async function verifyLinkKey(
  key: string,
  bot: Bot | null,
  options: { consume?: boolean } = {}
) {
  const otp = await prisma.telegramOtp.findFirst({
    where: {
      linkKey: key,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!otp) {
    return null;
  }

  if (options.consume !== false) {
    await consumeTelegramOtp(otp, bot);
  }

  return otp;
}
