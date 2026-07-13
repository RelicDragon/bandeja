import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { ApiError } from '../../utils/ApiError';
import { assertPadelooIntegrationConfig } from '../../shared/clubIntegration';
import { decryptToken, encryptToken } from '../../utils/tokenEncryption';

export type PadelooAuthStatus = {
  connected: boolean;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string | null;
  scoutOptIn: boolean;
};

export type PadelooSessionTokens = {
  accessToken: string;
  refreshToken: string | null;
  externalUserId: string;
};

export type StorePadelooAuthInput = {
  userId: string;
  clubId: string;
  accessToken: string;
  refreshToken?: string | null;
  externalUserId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

async function assertPadelooClub(clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, integrationType: true, integrationConfig: true },
  });
  if (!club) throw new ApiError(404, 'Club not found');
  if (club.integrationType !== ClubIntegrationType.PADELOO) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.clubNotConfigured);
  }
  assertPadelooIntegrationConfig(club.integrationType, club.integrationConfig);
  return club;
}

function toStatus(row: {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string;
  scoutOptIn: boolean;
}): PadelooAuthStatus {
  return {
    connected: true,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    externalUserId: row.externalUserId,
    scoutOptIn: row.scoutOptIn,
  };
}

export async function getPadelooAuthStatus(userId: string, clubId: string): Promise<PadelooAuthStatus> {
  await assertPadelooClub(clubId);
  const row = await prisma.userClubPadelooAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: { email: true, firstName: true, lastName: true, externalUserId: true, scoutOptIn: true },
  });
  if (!row) {
    return {
      connected: false,
      email: null,
      firstName: null,
      lastName: null,
      externalUserId: null,
      scoutOptIn: true,
    };
  }
  return toStatus(row);
}

export async function storePadelooAuth(input: StorePadelooAuthInput): Promise<PadelooAuthStatus> {
  await assertPadelooClub(input.clubId);
  const row = await prisma.userClubPadelooAuth.upsert({
    where: { userId_clubId: { userId: input.userId, clubId: input.clubId } },
    create: {
      userId: input.userId,
      clubId: input.clubId,
      externalUserId: input.externalUserId,
      email: input.email ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      accessToken: encryptToken(input.accessToken),
      refreshToken: input.refreshToken ? encryptToken(input.refreshToken) : null,
      scoutOptIn: true,
      scoutInvalidAt: null,
    },
    update: {
      externalUserId: input.externalUserId,
      email: input.email ?? null,
      ...(input.firstName !== undefined ? { firstName: input.firstName ?? null } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName ?? null } : {}),
      accessToken: encryptToken(input.accessToken),
      refreshToken: input.refreshToken ? encryptToken(input.refreshToken) : null,
      scoutInvalidAt: null,
    },
    select: { email: true, firstName: true, lastName: true, externalUserId: true, scoutOptIn: true },
  });
  return toStatus(row);
}

export async function getPadelooSessionTokens(
  userId: string,
  clubId: string,
): Promise<PadelooSessionTokens | null> {
  await assertPadelooClub(clubId);
  const row = await prisma.userClubPadelooAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: {
      accessToken: true,
      refreshToken: true,
      externalUserId: true,
    },
  });
  if (!row) return null;
  return {
    accessToken: decryptToken(row.accessToken),
    refreshToken: row.refreshToken ? decryptToken(row.refreshToken) : null,
    externalUserId: row.externalUserId,
  };
}

export async function disconnectPadelooAuth(userId: string, clubId: string): Promise<void> {
  await assertPadelooClub(clubId);
  await prisma.userClubPadelooAuth.deleteMany({
    where: { userId, clubId },
  });
}
