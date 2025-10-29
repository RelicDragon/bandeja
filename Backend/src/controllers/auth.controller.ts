import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { hashPassword, comparePassword } from '../utils/hash';
import { AuthProvider } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../utils/constants';

export const registerWithPhone = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password, firstName, lastName, email, language, gender, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { phone },
  });

  if (existingUser) {
    throw new ApiError(400, 'User with this phone already exists');
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      throw new ApiError(400, 'User with this email already exists');
    }
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash,
      firstName,
      lastName,
      email,
      language,
      gender: gender || undefined,
      preferredHandLeft: preferredHandLeft || false,
      preferredHandRight: preferredHandRight || false,
      preferredCourtSideLeft: preferredCourtSideLeft || false,
      preferredCourtSideRight: preferredCourtSideRight || false,
      authProvider: AuthProvider.PHONE,
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
      currentCity: {
        select: {
          id: true,
          name: true,
          country: true,
        },
      },
    },
  });

  const token = generateToken({ userId: user.id, phone: user.phone! });

  res.status(201).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithPhone = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { phone },
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
      passwordHash: true,
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

  if (!user || !user.passwordHash) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is inactive');
  }

  const token = generateToken({ userId: user.id, phone: user.phone! });

  const { passwordHash, ...userWithoutPassword } = user;
  void passwordHash;

  res.json({
    success: true,
    data: {
      user: userWithoutPassword,
      token,
    },
  });
});

export const registerWithTelegram = asyncHandler(async (req: Request, res: Response) => {
  const { telegramId, telegramUsername, firstName, lastName, email, language, gender, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (existingUser) {
    throw new ApiError(400, 'User with this Telegram account already exists');
  }

  if (email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      throw new ApiError(400, 'User with this email already exists');
    }
  }

  const user = await prisma.user.create({
    data: {
      telegramId,
      telegramUsername,
      firstName,
      lastName,
      email,
      language,
      gender: gender || undefined,
      preferredHandLeft: preferredHandLeft || false,
      preferredHandRight: preferredHandRight || false,
      preferredCourtSideLeft: preferredCourtSideLeft || false,
      preferredCourtSideRight: preferredCourtSideRight || false,
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
      currentCity: {
        select: {
          id: true,
          name: true,
          country: true,
        },
      },
    },
  });

  const token = generateToken({ userId: user.id, telegramId: user.telegramId! });

  res.status(201).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithTelegram = asyncHandler(async (req: Request, res: Response) => {
  const { telegramId } = req.body;

  const user = await prisma.user.findUnique({
    where: { telegramId },
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

  if (!user) {
    throw new ApiError(401, 'User not found');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is inactive');
  }

  const token = generateToken({ userId: user.id, telegramId: user.telegramId! });

  res.json({
    success: true,
    data: {
      user,
      token,
    },
  });
});

