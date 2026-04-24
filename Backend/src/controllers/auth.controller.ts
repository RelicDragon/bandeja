import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import {
  assertLoginIssuanceAllowed,
  issueLoginTokens,
  jwtPayloadFromAuthUser,
} from '../services/auth/authIssuance.service';
import { issuedRefreshJsonPayload } from '../utils/refreshWebCookie';
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

  assertLoginIssuanceAllowed(req);

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
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);

  res.status(201).json({
    success: true,
    data: {
      user,
      token: issued.token,
      ...issuedRefreshJsonPayload(req, res, issued),
    },
  });
});

export const loginWithPhone = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password, language } = req.body;

  const userWithPassword = await prisma.user.findUnique({
    where: { phone },
    select: {
      ...PROFILE_SELECT_FIELDS,
      passwordHash: true,
    },
  });

  if (!userWithPassword) {
    throw new ApiError(401, 'auth.invalidCredentials', true, { code: 'auth.invalidCredentials' });
  }

  if (!userWithPassword.passwordHash) {
    if (!userWithPassword.isActive) {
      throw new ApiError(403, 'auth.accountInactive');
    }
    throw new ApiError(401, 'auth.phoneLoginRequiresOAuth', true, { code: 'auth.phoneLoginRequiresOAuth' });
  }

  const isPasswordValid = await comparePassword(password, userWithPassword.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, 'auth.invalidCredentials', true, { code: 'auth.invalidCredentials' });
  }

  if (!userWithPassword.isActive) {
    throw new ApiError(403, 'auth.accountInactive');
  }

  if (language) {
    await prisma.user.update({
      where: { id: userWithPassword.id },
      data: { language },
    });
  }

  const user = await ensureUserCityAssigned(userWithPassword.id, req);
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);

  res.json({
    success: true,
    data: {
      user,
      token: issued.token,
      ...issuedRefreshJsonPayload(req, res, issued),
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

  assertLoginIssuanceAllowed(req);

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
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);

  res.status(201).json({
    success: true,
    data: {
      user,
      token: issued.token,
      ...issuedRefreshJsonPayload(req, res, issued),
    },
  });
});

export const loginWithTelegram = asyncHandler(async (req: Request, res: Response) => {
  const { telegramId, language } = req.body;

  let user = await prisma.user.findUnique({
    where: { telegramId },
    select: PROFILE_SELECT_FIELDS,
  });

  if (!user) {
    throw new ApiError(401, 'User not found', true, { code: 'auth.userNotFound' });
  }

  if (!user.isActive) {
    throw new ApiError(403, 'auth.accountInactive');
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
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);

  res.json({
    success: true,
    data: {
      user,
      token: issued.token,
      ...issuedRefreshJsonPayload(req, res, issued),
    },
  });
});

export const loginWithApple = asyncHandler(async (req: Request, res: Response) => {
  const { user, token, refreshToken, currentSessionId, statusCode } = await loginOrRegisterWithApple(req);
  res.status(statusCode).json({
    success: true,
    data: {
      user,
      token,
      ...issuedRefreshJsonPayload(req, res, { refreshToken, currentSessionId }),
    },
  });
});

export const loginWithGoogle = asyncHandler(async (req: Request, res: Response) => {
  const { user, token, refreshToken, currentSessionId, statusCode } = await loginOrRegisterWithGoogle(req);
  res.status(statusCode).json({
    success: true,
    data: {
      user,
      token,
      ...issuedRefreshJsonPayload(req, res, { refreshToken, currentSessionId }),
    },
  });
});

export const linkApple = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { identityToken, nonce } = req.body;

  if (!identityToken) {
    throw new ApiError(400, 'auth.identityTokenRequired');
  }

  if (!req.userId) {
    throw new ApiError(401, 'Authentication required', true, { code: 'auth.notAuthenticated' });
  }

  const appleToken = await verifyAppleIdentityToken(identityToken, nonce);
  const appleSub = appleToken.sub;

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, appleSub: true, email: true, appleEmail: true },
  });

  if (!currentUser) {
    throw new ApiError(404, 'errors.userNotFound');
  }

  if (currentUser.appleSub) {
    throw new ApiError(400, 'auth.appleAccountAlreadyLinked');
  }

  const existingAppleUser = await prisma.user.findUnique({
    where: { appleSub },
  });

  if (existingAppleUser && existingAppleUser.id !== req.userId) {
    throw new ApiError(400, 'auth.appleAccountAlreadyLinkedToAnotherUser');
  }

  const emailToUse = appleToken.email || undefined;
  const updateData: any = {
    appleSub,
    appleEmail: emailToUse,
    appleEmailVerified: emailToUse ? (appleToken.email_verified || false) : false,
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

  res.json({
    success: true,
    data: { user },
  });
});

export const unlinkApple = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Authentication required', true, { code: 'auth.notAuthenticated' });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, appleSub: true, phone: true, telegramId: true, googleId: true },
  });

  if (!currentUser) {
    throw new ApiError(404, 'errors.userNotFound');
  }

  if (!currentUser.appleSub) {
    throw new ApiError(400, 'auth.appleAccountNotLinked');
  }

  const hasOtherAuthMethods = !!(currentUser.phone || currentUser.telegramId || currentUser.googleId);

  if (!hasOtherAuthMethods) {
    throw new ApiError(400, 'auth.cannotUnlinkLastAuthMethod');
  }

  const updateData: any = {
    appleSub: null,
    appleEmail: null,
    appleEmailVerified: false,
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

export const linkGoogle = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new ApiError(400, 'auth.googleIdTokenRequired');
  }

  if (!req.userId) {
    throw new ApiError(401, 'Authentication required', true, { code: 'auth.notAuthenticated' });
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
    throw new ApiError(401, 'Authentication required', true, { code: 'auth.notAuthenticated' });
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
