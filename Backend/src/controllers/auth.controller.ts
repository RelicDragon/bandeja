import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { hashPassword, comparePassword } from '../utils/hash';
import { AuthProvider } from '@prisma/client';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';

export const registerWithPhone = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password, firstName, lastName, email, language, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;

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
      genderIsSet: genderIsSet || false,
      preferredHandLeft: preferredHandLeft || false,
      preferredHandRight: preferredHandRight || false,
      preferredCourtSideLeft: preferredCourtSideLeft || false,
      preferredCourtSideRight: preferredCourtSideRight || false,
      authProvider: AuthProvider.PHONE,
    },
    select: PROFILE_SELECT_FIELDS,
  });

  const token = generateToken({ userId: user.id, phone: user.phone! });

  res.status(201).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithPhone = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { phone, password, language } = req.body;

  let user = await prisma.user.findUnique({
    where: { phone },
    select: {
      ...PROFILE_SELECT_FIELDS,
      passwordHash: true,
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

  if (language) {
    await prisma.user.update({
      where: { id: user.id },
      data: { language },
    });
    user.language = language;
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
  const { telegramId, telegramUsername, firstName, lastName, email, language, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;

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
      genderIsSet: genderIsSet || false,
      preferredHandLeft: preferredHandLeft || false,
      preferredHandRight: preferredHandRight || false,
      preferredCourtSideLeft: preferredCourtSideLeft || false,
      preferredCourtSideRight: preferredCourtSideRight || false,
      authProvider: AuthProvider.TELEGRAM,
    },
    select: PROFILE_SELECT_FIELDS,
  });

  const token = generateToken({ userId: user.id, telegramId: user.telegramId! });

  res.status(201).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithTelegram = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { telegramId, language } = req.body;

  let user = await prisma.user.findUnique({
    where: { telegramId },
    select: PROFILE_SELECT_FIELDS,
  });

  if (!user) {
    throw new ApiError(401, 'User not found');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is inactive');
  }

  if (language) {
    await prisma.user.update({
      where: { id: user.id },
      data: { language },
    });
    user.language = language;
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

