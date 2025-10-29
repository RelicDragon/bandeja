import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { AuthProvider } from '@prisma/client';
import telegramBotService from '../services/telegramBot.service';
import { USER_SELECT_FIELDS } from '../utils/constants';

export const verifyTelegramOtp = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    throw new ApiError(400, 'Code is required');
  }

  const otp = await telegramBotService.verifyCode(code);

  if (!otp) {
    throw new ApiError(401, 'Invalid or expired code');
  }

  const actualTelegramId = otp.telegramId;

  let user = await prisma.user.findUnique({
    where: { telegramId: actualTelegramId },
    select: {
      ...USER_SELECT_FIELDS,
      phone: true,
      email: true,
      telegramId: true,
      telegramUsername: true,
      reliability: true,
      isAdmin: true,
      isTrainer: true,
      preferredHandLeft: true,
      preferredHandRight: true,
      preferredCourtSideLeft: true,
      preferredCourtSideRight: true,
      createdAt: true,
      isActive: true,
      currentCity: {
        select: {
          id: true,
          name: true,
          country: true,
        },
      },
    },
  });

  let token: string;

  if (user) {
    if (!user.isActive) {
      throw new ApiError(403, 'Account is inactive');
    }

    const updateData: any = {};
    if (otp.username && user.telegramUsername !== otp.username) {
      updateData.telegramUsername = otp.username;
    }
    if (otp.firstName && user.firstName !== otp.firstName) {
      updateData.firstName = otp.firstName;
    }
    if (otp.lastName && user.lastName !== otp.lastName) {
      updateData.lastName = otp.lastName;
    }

    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: {
          ...USER_SELECT_FIELDS,
          phone: true,
          email: true,
          telegramId: true,
          telegramUsername: true,
          reliability: true,
          isAdmin: true,
          isTrainer: true,
          preferredHandLeft: true,
          preferredHandRight: true,
          preferredCourtSideLeft: true,
          preferredCourtSideRight: true,
          createdAt: true,
          isActive: true,
          currentCity: {
            select: {
              id: true,
              name: true,
              country: true,
            },
          },
        },
      });
    }

    token = generateToken({ userId: user.id, telegramId: actualTelegramId });
  } else {
    user = await prisma.user.create({
      data: {
        telegramId: actualTelegramId,
        telegramUsername: otp.username,
        firstName: otp.firstName,
        lastName: otp.lastName,
        authProvider: AuthProvider.TELEGRAM,
      },
      select: {
        ...USER_SELECT_FIELDS,
        phone: true,
        email: true,
        telegramId: true,
        telegramUsername: true,
        reliability: true,
        isAdmin: true,
        isTrainer: true,
        preferredHandLeft: true,
        preferredHandRight: true,
        preferredCourtSideLeft: true,
        preferredCourtSideRight: true,
        createdAt: true,
        isActive: true,
        currentCity: {
          select: {
            id: true,
            name: true,
            country: true,
          },
        },
      },
    });

    token = generateToken({ userId: user.id, telegramId: actualTelegramId });
  }

  res.json({
    success: true,
    data: {
      user,
      token,
    },
  });
});

