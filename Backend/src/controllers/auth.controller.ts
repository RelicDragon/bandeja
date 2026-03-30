import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { hashPassword, comparePassword } from '../utils/hash';
import { NotificationChannelType } from '@prisma/client';
import { NotificationPreferenceService } from '../services/notificationPreference.service';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import { verifyAppleIdentityToken } from '../services/apple/appleAuth.service';
import { verifyGoogleIdToken } from '../services/google/googleAuth.service';
import { AuthRequest } from '../middleware/auth';
import { TransactionService } from '../services/transaction.service';
import { ensureUserCityAssigned } from '../services/user-city-bootstrap.service';
import { needsDisplayNamePersist, resolveDisplayNameData } from '../services/user/userDisplayName.service';
import { loginOrRegisterWithApple, loginOrRegisterWithGoogle } from '../services/auth/oauthLogin.service';

export const registerWithPhone = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password, firstName, lastName, email, language, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;
  const nameData = resolveDisplayNameData(firstName, lastName);

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

  let user = await prisma.user.create({
    data: {
      phone,
      passwordHash,
      firstName: nameData.firstName,
      lastName: nameData.lastName,
      nameIsSet: nameData.nameIsSet,
      email,
      language,
      gender: gender || undefined,
      genderIsSet: genderIsSet || false,
      preferredHandLeft: preferredHandLeft || false,
      preferredHandRight: preferredHandRight || false,
      preferredCourtSideLeft: preferredCourtSideLeft || false,
      preferredCourtSideRight: preferredCourtSideRight || false,
    },
    select: PROFILE_SELECT_FIELDS,
  });

  try {
    await TransactionService.createRegistrationBonus(user.id);
  } catch (e) {
    console.error('[registerWithPhone] Registration bonus failed:', e);
  }

  user = await ensureUserCityAssigned(user.id, req);
  const token = generateToken({ userId: user.id, phone: user.phone! });

  res.status(201).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithPhone = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { phone, password, language } = req.body;

  const userWithPassword = await prisma.user.findUnique({
    where: { phone },
    select: {
      ...PROFILE_SELECT_FIELDS,
      passwordHash: true,
    },
  });

  if (!userWithPassword || !userWithPassword.passwordHash) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const isPasswordValid = await comparePassword(password, userWithPassword.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  if (!userWithPassword.isActive) {
    throw new ApiError(403, 'Account is inactive');
  }

  if (language) {
    await prisma.user.update({
      where: { id: userWithPassword.id },
      data: { language },
    });
  }

  const user = await ensureUserCityAssigned(userWithPassword.id, req);
  const token = generateToken({ userId: user.id, phone: user.phone! });

  res.json({
    success: true,
    data: {
      user,
      token,
    },
  });
});

export const registerWithTelegram = asyncHandler(async (req: Request, res: Response) => {
  const { telegramId, telegramUsername, firstName, lastName, email, language, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;
  const nameData = resolveDisplayNameData(firstName, lastName);

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

  let user = await prisma.user.create({
    data: {
      telegramId,
      telegramUsername,
      firstName: nameData.firstName,
      lastName: nameData.lastName,
      nameIsSet: nameData.nameIsSet,
      email,
      language,
      gender: gender || undefined,
      genderIsSet: genderIsSet || false,
      preferredHandLeft: preferredHandLeft || false,
      preferredHandRight: preferredHandRight || false,
      preferredCourtSideLeft: preferredCourtSideLeft || false,
      preferredCourtSideRight: preferredCourtSideRight || false,
    },
    select: PROFILE_SELECT_FIELDS,
  });

  try {
    await TransactionService.createRegistrationBonus(user.id);
  } catch (e) {
    console.error('[registerWithTelegram] Registration bonus failed:', e);
  }

  await NotificationPreferenceService.ensurePreferenceForChannel(user.id, NotificationChannelType.TELEGRAM);

  user = await ensureUserCityAssigned(user.id, req);
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

  await NotificationPreferenceService.ensurePreferenceForChannel(user.id, NotificationChannelType.TELEGRAM);

  user = await ensureUserCityAssigned(user.id, req);
  const token = generateToken({ userId: user.id, telegramId: user.telegramId! });

  res.json({
    success: true,
    data: {
      user,
      token,
    },
  });
});

export const loginWithApple = asyncHandler(async (req: Request, res: Response) => {
  const { user, token, statusCode } = await loginOrRegisterWithApple(req);
  res.status(statusCode).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithGoogle = asyncHandler(async (req: Request, res: Response) => {
  const { user, token, statusCode } = await loginOrRegisterWithGoogle(req);
  res.status(statusCode).json({
    success: true,
    data: { user, token },
  });
});

export const linkApple = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('[APPLE_LINK] linkApple called, userId:', req.userId);
  console.log('[APPLE_LINK] Request body received:', {
    hasIdentityToken: !!req.body.identityToken,
    identityTokenLength: req.body.identityToken?.length || 0,
    identityTokenPreview: req.body.identityToken ? req.body.identityToken.substring(0, 50) + '...' : undefined,
    hasNonce: !!req.body.nonce,
    nonceLength: req.body.nonce?.length || 0,
  });
  const { identityToken, nonce } = req.body;

  if (!identityToken) {
    console.error('[APPLE_LINK] Missing identityToken');
    throw new ApiError(400, 'auth.identityTokenRequired');
  }

  if (!req.userId) {
    console.error('[APPLE_LINK] Missing userId');
    throw new ApiError(401, 'Authentication required');
  }

  console.log('[APPLE_LINK] Verifying Apple identity token');
  const appleToken = await verifyAppleIdentityToken(identityToken, nonce);
  const appleSub = appleToken.sub;
  console.log('[APPLE_LINK] Apple token verified, full decoded token:', {
    sub: appleToken.sub,
    email: appleToken.email || 'none',
    email_verified: appleToken.email_verified || false,
    iss: appleToken.iss,
    aud: appleToken.aud,
    exp: appleToken.exp,
    iat: appleToken.iat,
    hasNonce: !!appleToken.nonce,
  });

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, appleSub: true, email: true, appleEmail: true },
  });

  if (!currentUser) {
    console.log('[APPLE_LINK] Current user not found');
    throw new ApiError(404, 'errors.userNotFound');
  }

  if (currentUser.appleSub) {
    console.log('[APPLE_LINK] User already has appleSub linked');
    throw new ApiError(400, 'auth.appleAccountAlreadyLinked');
  }

  const existingAppleUser = await prisma.user.findUnique({
    where: { appleSub },
  });

  if (existingAppleUser && existingAppleUser.id !== req.userId) {
    console.log('[APPLE_LINK] Apple account already linked to another user');
    throw new ApiError(400, 'auth.appleAccountAlreadyLinkedToAnotherUser');
  }

  const emailToUse = appleToken.email || undefined;
  const updateData: any = {
    appleSub,
    appleEmail: emailToUse,
    appleEmailVerified: emailToUse ? (appleToken.email_verified || false) : false,
  };

  if (emailToUse) {
    console.log('[APPLE_LINK] Checking email conflict:', emailToUse);
    const existingEmail = await prisma.user.findUnique({
      where: { email: emailToUse },
    });
    
    if (!existingEmail || existingEmail.id === req.userId) {
      if (!currentUser.email) {
        updateData.email = emailToUse;
        console.log('[APPLE_LINK] Setting email from Apple token');
      }
    }
  }

  console.log('[APPLE_LINK] Updating user with Apple account');
  let user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: PROFILE_SELECT_FIELDS,
  });

  const nameAfterLink = resolveDisplayNameData(user.firstName, user.lastName);
  if (needsDisplayNamePersist(user, nameAfterLink)) {
    user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        firstName: nameAfterLink.firstName ?? null,
        lastName: nameAfterLink.lastName ?? null,
        nameIsSet: nameAfterLink.nameIsSet,
      },
      select: PROFILE_SELECT_FIELDS,
    });
  }

  console.log('[APPLE_LINK] Apple account linked successfully');
  res.json({
    success: true,
    data: { user },
  });
});

export const unlinkApple = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('[APPLE_UNLINK] unlinkApple called, userId:', req.userId);
  
  if (!req.userId) {
    console.error('[APPLE_UNLINK] Missing userId');
    throw new ApiError(401, 'Authentication required');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, appleSub: true, phone: true, telegramId: true, googleId: true },
  });

  if (!currentUser) {
    console.log('[APPLE_UNLINK] Current user not found');
    throw new ApiError(404, 'errors.userNotFound');
  }

  if (!currentUser.appleSub) {
    console.log('[APPLE_UNLINK] User does not have appleSub linked');
    throw new ApiError(400, 'auth.appleAccountNotLinked');
  }

  const hasOtherAuthMethods = !!(currentUser.phone || currentUser.telegramId || currentUser.googleId);
  console.log('[APPLE_UNLINK] Has other auth methods:', hasOtherAuthMethods, { phone: !!currentUser.phone, telegramId: !!currentUser.telegramId, googleId: !!currentUser.googleId });
  
  if (!hasOtherAuthMethods) {
    console.log('[APPLE_UNLINK] Cannot unlink last auth method');
    throw new ApiError(400, 'auth.cannotUnlinkLastAuthMethod');
  }

  const updateData: any = {
    appleSub: null,
    appleEmail: null,
    appleEmailVerified: false,
  };

  console.log('[APPLE_UNLINK] Updating user to unlink Apple account');
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: PROFILE_SELECT_FIELDS,
  });

  console.log('[APPLE_UNLINK] Apple account unlinked successfully');
  res.json({
    success: true,
    data: { user },
  });
});

export const linkGoogle = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new ApiError(400, 'auth.googleIdTokenRequired');
  }

  if (!req.userId) {
    throw new ApiError(401, 'Authentication required');
  }

  const googleToken = await verifyGoogleIdToken(idToken);
  const googleId = googleToken.sub;

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, googleId: true, email: true, googleEmail: true },
  });

  if (!currentUser) {
    throw new ApiError(404, 'errors.userNotFound');
  }

  if (currentUser.googleId) {
    throw new ApiError(400, 'auth.googleAccountAlreadyLinked');
  }

  const existingGoogleUser = await prisma.user.findUnique({
    where: { googleId },
  });

  if (existingGoogleUser && existingGoogleUser.id !== req.userId) {
    throw new ApiError(400, 'auth.googleAccountAlreadyLinkedToAnotherUser');
  }

  const emailToUse = googleToken.email || undefined;
  const updateData: any = {
    googleId,
    googleEmail: emailToUse,
    googleEmailVerified: emailToUse ? (googleToken.email_verified || false) : false,
  };

  if (emailToUse) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: emailToUse },
    });
    
    if (!existingEmail || existingEmail.id === req.userId) {
      if (!currentUser.email) {
        updateData.email = emailToUse;
      }
    }
  }

  let user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: PROFILE_SELECT_FIELDS,
  });

  const nameAfterGoogleLink = resolveDisplayNameData(user.firstName, user.lastName);
  if (needsDisplayNamePersist(user, nameAfterGoogleLink)) {
    user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        firstName: nameAfterGoogleLink.firstName ?? null,
        lastName: nameAfterGoogleLink.lastName ?? null,
        nameIsSet: nameAfterGoogleLink.nameIsSet,
      },
      select: PROFILE_SELECT_FIELDS,
    });
  }

  res.json({
    success: true,
    data: { user },
  });
});

export const unlinkGoogle = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, googleId: true, phone: true, telegramId: true, appleSub: true },
  });

  if (!currentUser) {
    throw new ApiError(404, 'errors.userNotFound');
  }

  if (!currentUser.googleId) {
    throw new ApiError(400, 'auth.googleAccountNotLinked');
  }

  const hasOtherAuthMethods = !!(currentUser.phone || currentUser.telegramId || currentUser.appleSub);
  
  if (!hasOtherAuthMethods) {
    throw new ApiError(400, 'auth.cannotUnlinkLastAuthMethod');
  }

  const updateData: any = {
    googleId: null,
    googleEmail: null,
    googleEmailVerified: false,
  };

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: PROFILE_SELECT_FIELDS,
  });

  res.json({
    success: true,
    data: { user },
  });
});
