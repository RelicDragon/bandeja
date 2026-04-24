import { Request } from 'express';
import { Gender, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import {
  assertLoginIssuanceAllowed,
  issueLoginTokens,
  jwtPayloadFromAuthUser,
} from './authIssuance.service';
import { verifyGoogleIdToken } from '../google/googleAuth.service';
import { verifyAppleIdentityToken } from '../apple/appleAuth.service';
import { ensureUserCityAssigned } from '../user-city-bootstrap.service';
import { TransactionService } from '../transaction.service';
import {
  mergeOAuthLoginNames,
  needsDisplayNamePersist,
  resolveDisplayNameData,
} from '../user/userDisplayName.service';
const SUPPORTED_LANGS = ['en', 'ru', 'sr', 'es', 'auto'];

type GoogleTokenPayload = Awaited<ReturnType<typeof verifyGoogleIdToken>>;
type AppleTokenDecoded = Awaited<ReturnType<typeof verifyAppleIdentityToken>>;

function normalizeRegisterLanguage(language: unknown): string | undefined {
  if (!language || typeof language !== 'string') return undefined;
  const code = language.toLowerCase().split('-')[0];
  return SUPPORTED_LANGS.includes(code) ? language : 'en';
}

function pickLoginLanguage(language: unknown): string | undefined {
  if (!language || typeof language !== 'string') return undefined;
  const code = language.toLowerCase().split('-')[0];
  return SUPPORTED_LANGS.includes(code) ? language : undefined;
}

type ProfileUser = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT_FIELDS }>;

type OAuthResult = {
  user: ProfileUser;
  token: string;
  refreshToken?: string;
  currentSessionId?: string;
  statusCode: 200 | 201;
};

async function finalizeGoogleUser(
  userId: string,
  req: Request
): Promise<{ user: ProfileUser; token: string; refreshToken?: string; currentSessionId?: string }> {
  const user = await ensureUserCityAssigned(userId, req);
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);
  return { user, token: issued.token, refreshToken: issued.refreshToken, currentSessionId: issued.currentSessionId };
}

async function applyGoogleLoginProfileUpdates(
  user: ProfileUser,
  googleToken: GoogleTokenPayload,
  body: { language?: unknown; firstName?: unknown; lastName?: unknown }
) {
  const updateData: Record<string, unknown> = {};
  const lang = pickLoginLanguage(body.language);
  if (lang) updateData.language = lang;

  const nameResolved = mergeOAuthLoginNames(
    user.firstName,
    user.lastName,
    typeof body.firstName === 'string' ? body.firstName : undefined,
    typeof body.lastName === 'string' ? body.lastName : undefined,
    user.nameIsSet
  );
  if (needsDisplayNamePersist(user, nameResolved)) {
    updateData.firstName = nameResolved.firstName ?? null;
    updateData.lastName = nameResolved.lastName ?? null;
    updateData.nameIsSet = nameResolved.nameIsSet;
  }

  if (googleToken.email) {
    if (!user.googleEmail) {
      const emailConflict = await prisma.user.findUnique({ where: { email: googleToken.email } });
      updateData.googleEmail = googleToken.email;
      updateData.googleEmailVerified = googleToken.email_verified || false;
      if (!user.email && (!emailConflict || emailConflict.id === user.id)) {
        updateData.email = googleToken.email;
      } else if (user.email === googleToken.email) {
        updateData.email = googleToken.email;
      }
    } else if (googleToken.email !== user.googleEmail) {
      const emailConflict = await prisma.user.findUnique({ where: { email: googleToken.email } });
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
        const emailConflict = await prisma.user.findUnique({ where: { email: googleToken.email } });
        if (!emailConflict || emailConflict.id === user.id) {
          updateData.email = googleToken.email;
        }
      }
    }
  }

  if (Object.keys(updateData).length > 0) {
    return prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: PROFILE_SELECT_FIELDS,
    });
  }
  return user;
}

export async function loginOrRegisterWithGoogle(req: Request): Promise<OAuthResult> {
  const body = req.body as Record<string, unknown>;
  const idToken = body.idToken;
  if (!idToken || typeof idToken !== 'string') {
    throw new ApiError(400, 'auth.googleIdTokenRequired');
  }

  const googleToken = await verifyGoogleIdToken(idToken);
  assertLoginIssuanceAllowed(req);
  const googleId = googleToken.sub;

  let user = await prisma.user.findUnique({
    where: { googleId },
    select: PROFILE_SELECT_FIELDS,
  });

  if (user) {
    if (!user.isActive) {
      throw new ApiError(403, 'auth.accountInactive');
    }
    user = await applyGoogleLoginProfileUpdates(user, googleToken, {
      language: body.language,
      firstName: body.firstName,
      lastName: body.lastName,
    });
    const { user: out, token, refreshToken, currentSessionId } = await finalizeGoogleUser(user.id, req);
    return { user: out, token, refreshToken, currentSessionId, statusCode: 200 };
  }

  const emailToUse = googleToken.email || undefined;
  if (emailToUse) {
    const existingEmail = await prisma.user.findUnique({ where: { email: emailToUse } });
    if (existingEmail) {
      if (existingEmail.googleId) {
        throw new ApiError(400, 'auth.googleAccountAlreadyExists');
      }
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
  }

  const nameData = resolveDisplayNameData(
    typeof body.firstName === 'string' ? body.firstName : googleToken.given_name || undefined,
    typeof body.lastName === 'string' ? body.lastName : googleToken.family_name || undefined
  );

  const validatedLanguage = normalizeRegisterLanguage(body.language);

  const rawGender = typeof body.gender === 'string' ? body.gender : undefined;
  const gender = rawGender ? (rawGender as Gender) : undefined;
  const genderIsSet = body.genderIsSet === true;
  const preferredHandLeft = body.preferredHandLeft === true;
  const preferredHandRight = body.preferredHandRight === true;
  const preferredCourtSideLeft = body.preferredCourtSideLeft === true;
  const preferredCourtSideRight = body.preferredCourtSideRight === true;

  try {
    user = (await prisma.user.create({
      data: {
        googleId,
        googleEmail: emailToUse,
        googleEmailVerified: emailToUse ? googleToken.email_verified || false : false,
        firstName: nameData.firstName,
        lastName: nameData.lastName,
        nameIsSet: nameData.nameIsSet,
        email: emailToUse,
        language: validatedLanguage,
        gender: gender || undefined,
        genderIsSet,
        preferredHandLeft,
        preferredHandRight,
        preferredCourtSideLeft,
        preferredCourtSideRight,
      },
      select: PROFILE_SELECT_FIELDS,
    })) as ProfileUser;
    try {
      await TransactionService.createRegistrationBonus(user.id);
    } catch (e) {
      console.error('[oauthLogin Google] Registration bonus failed:', e);
    }
  } catch (createError: unknown) {
    const err = createError as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002' && targetIncludes(err.meta?.target, 'googleId')) {
      user = await prisma.user.findUnique({
        where: { googleId },
        select: PROFILE_SELECT_FIELDS,
      });
      if (!user) throw createError;
      if (!user.isActive) throw new ApiError(403, 'auth.accountInactive');
      user = await applyGoogleLoginProfileUpdates(user, googleToken, {
        language: body.language,
        firstName: body.firstName,
        lastName: body.lastName,
      });
      const { user: out, token, refreshToken, currentSessionId } = await finalizeGoogleUser(user.id, req);
      return { user: out, token, refreshToken, currentSessionId, statusCode: 200 };
    }
    if (err.code === 'P2002' && targetIncludes(err.meta?.target, 'email')) {
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
    throw createError;
  }

  const { user: out, token, refreshToken, currentSessionId } = await finalizeGoogleUser(user.id, req);
  return { user: out, token, refreshToken, currentSessionId, statusCode: 201 };
}

function targetIncludes(target: unknown, field: string): boolean {
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target === field || target.includes(field);
  return false;
}

async function finalizeAppleUser(
  userId: string,
  req: Request
): Promise<{ user: ProfileUser; token: string; refreshToken?: string; currentSessionId?: string }> {
  const user = await ensureUserCityAssigned(userId, req);
  const issued = await issueLoginTokens(jwtPayloadFromAuthUser(user), req);
  return { user, token: issued.token, refreshToken: issued.refreshToken, currentSessionId: issued.currentSessionId };
}

async function applyAppleLoginProfileUpdates(
  user: ProfileUser,
  appleToken: AppleTokenDecoded,
  body: { language?: unknown; firstName?: unknown; lastName?: unknown }
) {
  const updateData: Record<string, unknown> = {};
  const lang = pickLoginLanguage(body.language);
  if (lang) updateData.language = lang;

  const nameResolved = mergeOAuthLoginNames(
    user.firstName,
    user.lastName,
    typeof body.firstName === 'string' ? body.firstName : undefined,
    typeof body.lastName === 'string' ? body.lastName : undefined,
    user.nameIsSet
  );
  if (needsDisplayNamePersist(user, nameResolved)) {
    updateData.firstName = nameResolved.firstName ?? null;
    updateData.lastName = nameResolved.lastName ?? null;
    updateData.nameIsSet = nameResolved.nameIsSet;
  }

  if (appleToken.email) {
    if (!user.appleEmail) {
      const emailConflict = await prisma.user.findUnique({ where: { email: appleToken.email } });
      updateData.appleEmail = appleToken.email;
      updateData.appleEmailVerified = appleToken.email_verified || false;
      if (!user.email && (!emailConflict || emailConflict.id === user.id)) {
        updateData.email = appleToken.email;
      }
    } else if (appleToken.email !== user.appleEmail) {
      const emailConflict = await prisma.user.findUnique({ where: { email: appleToken.email } });
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
    return prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: PROFILE_SELECT_FIELDS,
    });
  }
  return user;
}

export async function loginOrRegisterWithApple(req: Request): Promise<OAuthResult> {
  const body = req.body as Record<string, unknown>;
  const identityToken = body.identityToken;
  const nonce = body.nonce;

  if (!identityToken || typeof identityToken !== 'string') {
    throw new ApiError(400, 'auth.identityTokenRequired');
  }
  if (typeof nonce !== 'string' || nonce.length === 0) {
    throw new ApiError(400, 'auth.appleTokenNonceRequired');
  }

  const appleToken = await verifyAppleIdentityToken(identityToken, nonce);
  assertLoginIssuanceAllowed(req);
  const appleSub = appleToken.sub;

  let user = await prisma.user.findUnique({
    where: { appleSub },
    select: PROFILE_SELECT_FIELDS,
  });

  if (user) {
    if (!user.isActive) {
      throw new ApiError(403, 'auth.accountInactive');
    }
    user = await applyAppleLoginProfileUpdates(user, appleToken, {
      language: body.language,
      firstName: body.firstName,
      lastName: body.lastName,
    });
    const { user: out, token, refreshToken, currentSessionId } = await finalizeAppleUser(user.id, req);
    return { user: out, token, refreshToken, currentSessionId, statusCode: 200 };
  }

  const emailToUse = appleToken.email || undefined;
  if (emailToUse) {
    const existingEmail = await prisma.user.findUnique({ where: { email: emailToUse } });
    if (existingEmail) {
      if (existingEmail.appleSub) {
        throw new ApiError(400, 'auth.appleAccountAlreadyExists');
      }
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
  }

  const nameData = resolveDisplayNameData(
    typeof body.firstName === 'string' ? body.firstName : undefined,
    typeof body.lastName === 'string' ? body.lastName : undefined
  );

  const validatedLanguage = normalizeRegisterLanguage(body.language);

  const rawGenderApple = typeof body.gender === 'string' ? body.gender : undefined;
  const genderApple = rawGenderApple ? (rawGenderApple as Gender) : undefined;
  const genderIsSet = body.genderIsSet === true;
  const preferredHandLeft = body.preferredHandLeft === true;
  const preferredHandRight = body.preferredHandRight === true;
  const preferredCourtSideLeft = body.preferredCourtSideLeft === true;
  const preferredCourtSideRight = body.preferredCourtSideRight === true;

  try {
    user = (await prisma.user.create({
      data: {
        appleSub,
        appleEmail: emailToUse,
        appleEmailVerified: emailToUse ? appleToken.email_verified || false : false,
        firstName: nameData.firstName,
        lastName: nameData.lastName,
        nameIsSet: nameData.nameIsSet,
        email: emailToUse,
        language: validatedLanguage,
        gender: genderApple || undefined,
        genderIsSet,
        preferredHandLeft,
        preferredHandRight,
        preferredCourtSideLeft,
        preferredCourtSideRight,
      },
      select: PROFILE_SELECT_FIELDS,
    })) as ProfileUser;
    try {
      await TransactionService.createRegistrationBonus(user.id);
    } catch (e) {
      console.error('[oauthLogin Apple] Registration bonus failed:', e);
    }
  } catch (createError: unknown) {
    const err = createError as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002' && targetIncludes(err.meta?.target, 'appleSub')) {
      user = await prisma.user.findUnique({
        where: { appleSub },
        select: PROFILE_SELECT_FIELDS,
      });
      if (!user) throw createError;
      if (!user.isActive) throw new ApiError(403, 'auth.accountInactive');
      user = await applyAppleLoginProfileUpdates(user, appleToken, {
        language: body.language,
        firstName: body.firstName,
        lastName: body.lastName,
      });
      const { user: out, token, refreshToken, currentSessionId } = await finalizeAppleUser(user.id, req);
      return { user: out, token, refreshToken, currentSessionId, statusCode: 200 };
    }
    if (err.code === 'P2002' && targetIncludes(err.meta?.target, 'email')) {
      throw new ApiError(400, 'auth.emailAlreadyExistsUseLogin');
    }
    throw createError;
  }

  const { user: out, token, refreshToken, currentSessionId } = await finalizeAppleUser(user.id, req);
  return { user: out, token, refreshToken, currentSessionId, statusCode: 201 };
}
