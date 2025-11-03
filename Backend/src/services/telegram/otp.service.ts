import { Bot } from 'grammy';
import prisma from '../../config/database';
import { deleteOtpMessages } from './cleanup.service';

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function verifyCode(code: string, bot: Bot | null) {
  const otp = await prisma.telegramOtp.findFirst({
    where: {
      code,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!otp) {
    return null;
  }

  await deleteOtpMessages(otp, bot);

  await prisma.telegramOtp.delete({
    where: { id: otp.id },
  });

  return otp;
}

