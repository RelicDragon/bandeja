import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { hashPassword, comparePassword } from '../utils/hash';
import { AuthProvider } from '@prisma/client';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import { verifyAppleIdentityToken } from '../services/apple/appleAuth.service';
import { verifyGoogleIdToken } from '../services/google/googleAuth.service';

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

export const registerWithApple = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { identityToken, nonce, firstName, lastName, language, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;

  if (!identityToken) {
    throw new ApiError(400, 'auth.identityTokenRequired');
  }

  const appleToken = await verifyAppleIdentityToken(identityToken, nonce);
  const appleSub = appleToken.sub;

  const existingUser = await prisma.user.findUnique({
    where: { appleSub },
  });

  if (existingUser) {
    throw new ApiError(400, 'auth.appleAccountAlreadyExists');
  }

  const emailToUse = appleToken.email || undefined;
  
  if (emailToUse) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: emailToUse },
    });
    if (existingEmail) {
      if (existingEmail.appleSub) {
        throw new ApiError(400, 'auth.appleAccountAlreadyExists');
      }
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
  }

  const sanitizedFirstName = firstName ? firstName.trim().slice(0, 100) : undefined;
  const sanitizedLastName = lastName ? lastName.trim().slice(0, 100) : undefined;

  if (sanitizedFirstName || sanitizedLastName) {
    const trimmedFirst = sanitizedFirstName || '';
    const trimmedLast = sanitizedLastName || '';
    if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
      throw new ApiError(400, 'auth.nameMinLength');
    }
  }

  let validatedLanguage = language;
  if (language) {
    const supportedLanguages = ['en', 'ru', 'sr', 'es', 'auto'];
    const languageCode = language.toLowerCase().split('-')[0];
    if (!supportedLanguages.includes(languageCode)) {
      validatedLanguage = 'en';
    }
  }

  let user;
  try {
    user = await prisma.user.create({
    data: {
      appleSub,
      appleEmail: emailToUse,
      appleEmailVerified: emailToUse ? (appleToken.email_verified || false) : false,
      firstName: sanitizedFirstName || undefined,
      lastName: sanitizedLastName || undefined,
      email: emailToUse,
      language: validatedLanguage,
      gender: gender || undefined,
      genderIsSet: genderIsSet || false,
      preferredHandLeft: preferredHandLeft || false,
      preferredHandRight: preferredHandRight || false,
      preferredCourtSideLeft: preferredCourtSideLeft || false,
      preferredCourtSideRight: preferredCourtSideRight || false,
      authProvider: AuthProvider.APPLE,
    },
    select: PROFILE_SELECT_FIELDS,
    });
  } catch (createError: any) {
    if (createError.code === 'P2002' && createError.meta?.target?.includes('appleSub')) {
      throw new ApiError(400, 'auth.appleAccountAlreadyExists');
    }
    if (createError.code === 'P2002' && createError.meta?.target?.includes('email')) {
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
    throw createError;
  }

  const token = generateToken({ userId: user.id, appleId: appleSub });

  res.status(201).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithApple = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { identityToken, nonce, language, firstName, lastName } = req.body;

  if (!identityToken) {
    throw new ApiError(400, 'auth.identityTokenRequired');
  }

  const appleToken = await verifyAppleIdentityToken(identityToken, nonce);
  const appleSub = appleToken.sub;

  let user = await prisma.user.findUnique({
    where: { appleSub },
    select: PROFILE_SELECT_FIELDS,
  });

  if (!user) {
    throw new ApiError(401, 'errors.userNotFound');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'auth.accountInactive');
  }

  const updateData: any = {};
  
  if (language) {
    const supportedLanguages = ['en', 'ru', 'sr', 'es', 'auto'];
    const languageCode = language.toLowerCase().split('-')[0];
    if (supportedLanguages.includes(languageCode)) {
      updateData.language = language;
    }
  }

  if (firstName && !user.firstName) {
    const sanitizedFirstName = firstName.trim().slice(0, 100);
    if (sanitizedFirstName.length >= 3 || (user.lastName && user.lastName.trim().length >= 3)) {
      updateData.firstName = sanitizedFirstName;
    }
  }

  if (lastName && !user.lastName) {
    const sanitizedLastName = lastName.trim().slice(0, 100);
    const currentFirstName = updateData.firstName || user.firstName || '';
    if (sanitizedLastName.length >= 3 || (currentFirstName && currentFirstName.trim().length >= 3)) {
      updateData.lastName = sanitizedLastName;
    }
  }

  if (updateData.firstName !== undefined || updateData.lastName !== undefined) {
    const finalFirstName = updateData.firstName !== undefined ? updateData.firstName : (user.firstName || '');
    const finalLastName = updateData.lastName !== undefined ? updateData.lastName : (user.lastName || '');
    const trimmedFirst = finalFirstName.trim();
    const trimmedLast = finalLastName.trim();
    
    if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
      delete updateData.firstName;
      delete updateData.lastName;
    }
  }

  if (appleToken.email) {
    if (!user.appleEmail) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: appleToken.email },
      });
      
      updateData.appleEmail = appleToken.email;
      updateData.appleEmailVerified = appleToken.email_verified || false;
      
      if (!user.email && (!emailConflict || emailConflict.id === user.id)) {
        updateData.email = appleToken.email;
      }
    } else if (appleToken.email !== user.appleEmail) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: appleToken.email },
      });
      
      updateData.appleEmail = appleToken.email;
      updateData.appleEmailVerified = appleToken.email_verified || false;
      
      if (!user.email && (!emailConflict || emailConflict.id === user.id)) {
        updateData.email = appleToken.email;
      }
    } else if (appleToken.email_verified && !user.appleEmailVerified) {
      updateData.appleEmailVerified = true;
    }
  }

  if (Object.keys(updateData).length > 0) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: PROFILE_SELECT_FIELDS,
    });
  }

  const token = generateToken({ userId: user.id, appleId: appleSub });

  res.json({
    success: true,
    data: {
      user,
      token,
    },
  });
});

export const registerWithGoogle = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { idToken, firstName, lastName, language, gender, genderIsSet, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight } = req.body;

  if (!idToken) {
    throw new ApiError(400, 'auth.googleIdTokenRequired');
  }

  const googleToken = await verifyGoogleIdToken(idToken);
  const googleId = googleToken.sub;
  const emailToUse = googleToken.email || undefined;

  const existingUser = await prisma.user.findUnique({
    where: { googleId },
  });

  if (existingUser) {
    throw new ApiError(400, 'auth.googleAccountAlreadyExists');
  }

  if (emailToUse) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: emailToUse },
    });
    if (existingEmail) {
      if (existingEmail.googleId) {
        throw new ApiError(400, 'auth.googleAccountAlreadyExists');
      }
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
  }

  const sanitizedFirstName = firstName ? firstName.trim().slice(0, 100) : (googleToken.given_name ? googleToken.given_name.trim().slice(0, 100) : undefined);
  const sanitizedLastName = lastName ? lastName.trim().slice(0, 100) : (googleToken.family_name ? googleToken.family_name.trim().slice(0, 100) : undefined);

  const trimmedFirst = sanitizedFirstName || '';
  const trimmedLast = sanitizedLastName || '';
  
  if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
    throw new ApiError(400, 'auth.nameMinLength');
  }

  let validatedLanguage = language;
  if (language) {
    const supportedLanguages = ['en', 'ru', 'sr', 'es', 'auto'];
    const languageCode = language.toLowerCase().split('-')[0];
    if (!supportedLanguages.includes(languageCode)) {
      validatedLanguage = 'en';
    }
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        googleId,
        googleEmail: emailToUse,
        googleEmailVerified: emailToUse ? (googleToken.email_verified || false) : false,
        firstName: sanitizedFirstName || undefined,
        lastName: sanitizedLastName || undefined,
        email: emailToUse,
        language: validatedLanguage,
        gender: gender || undefined,
        genderIsSet: genderIsSet || false,
        preferredHandLeft: preferredHandLeft || false,
        preferredHandRight: preferredHandRight || false,
        preferredCourtSideLeft: preferredCourtSideLeft || false,
        preferredCourtSideRight: preferredCourtSideRight || false,
        authProvider: AuthProvider.GOOGLE,
      },
      select: PROFILE_SELECT_FIELDS,
    });
  } catch (createError: any) {
    if (createError.code === 'P2002' && createError.meta?.target?.includes('googleId')) {
      throw new ApiError(400, 'auth.googleAccountAlreadyExists');
    }
    if (createError.code === 'P2002' && createError.meta?.target?.includes('email')) {
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
    throw createError;
  }

  const token = generateToken({ userId: user.id, googleId });

  res.status(201).json({
    success: true,
    data: { user, token },
  });
});

export const loginWithGoogle = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { idToken, language, firstName, lastName } = req.body;

  if (!idToken) {
    throw new ApiError(400, 'auth.googleIdTokenRequired');
  }

  const googleToken = await verifyGoogleIdToken(idToken);
  const googleId = googleToken.sub;

  let user = await prisma.user.findUnique({
    where: { googleId },
    select: PROFILE_SELECT_FIELDS,
  });

  if (!user) {
    throw new ApiError(401, 'errors.userNotFound');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'auth.accountInactive');
  }

  if (user.authProvider !== AuthProvider.GOOGLE) {
    throw new ApiError(403, 'auth.invalidAuthProvider');
  }

  const updateData: any = {};
  
  if (language) {
    const supportedLanguages = ['en', 'ru', 'sr', 'es', 'auto'];
    const languageCode = language.toLowerCase().split('-')[0];
    if (supportedLanguages.includes(languageCode)) {
      updateData.language = language;
    }
  }

  if (firstName && !user.firstName) {
    const sanitizedFirstName = firstName.trim().slice(0, 100);
    if (sanitizedFirstName.length >= 3 || (user.lastName && user.lastName.trim().length >= 3)) {
      updateData.firstName = sanitizedFirstName;
    }
  }

  if (lastName && !user.lastName) {
    const sanitizedLastName = lastName.trim().slice(0, 100);
    const currentFirstName = updateData.firstName || user.firstName || '';
    if (sanitizedLastName.length >= 3 || (currentFirstName && currentFirstName.trim().length >= 3)) {
      updateData.lastName = sanitizedLastName;
    }
  }

  if (updateData.firstName !== undefined || updateData.lastName !== undefined) {
    const finalFirstName = updateData.firstName !== undefined ? updateData.firstName : (user.firstName || '');
    const finalLastName = updateData.lastName !== undefined ? updateData.lastName : (user.lastName || '');
    const trimmedFirst = finalFirstName.trim();
    const trimmedLast = finalLastName.trim();
    
    if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
      delete updateData.firstName;
      delete updateData.lastName;
    }
  }

  if (googleToken.email) {
    if (!user.googleEmail) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: googleToken.email },
      });
      
      updateData.googleEmail = googleToken.email;
      updateData.googleEmailVerified = googleToken.email_verified || false;
      
      if (!user.email && (!emailConflict || emailConflict.id === user.id)) {
        updateData.email = googleToken.email;
      } else if (user.email === googleToken.email) {
        updateData.email = googleToken.email;
      }
    } else if (googleToken.email !== user.googleEmail) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: googleToken.email },
      });
      
      updateData.googleEmail = googleToken.email;
      updateData.googleEmailVerified = googleToken.email_verified || false;
      
      if (!user.email && (!emailConflict || emailConflict.id === user.id)) {
        updateData.email = googleToken.email;
      } else if (user.email === googleToken.email) {
        updateData.email = googleToken.email;
      }
    } else {
      if (googleToken.email_verified && !user.googleEmailVerified) {
        updateData.googleEmailVerified = true;
      }
      if (!user.email && googleToken.email_verified) {
        const emailConflict = await prisma.user.findUnique({
          where: { email: googleToken.email },
        });
        if (!emailConflict || emailConflict.id === user.id) {
          updateData.email = googleToken.email;
        }
      }
    }
  }

  if (Object.keys(updateData).length > 0) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: PROFILE_SELECT_FIELDS,
    });
  }

  const token = generateToken({ userId: user.id, googleId });

  res.json({
    success: true,
    data: {
      user,
      token,
    },
  });
});
