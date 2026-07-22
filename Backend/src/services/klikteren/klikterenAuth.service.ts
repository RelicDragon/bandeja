import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { ApiError } from '../../utils/ApiError';
import { assertKlikterenIntegrationConfig } from '../../shared/clubIntegration';
import { decryptToken, encryptToken } from '../../utils/tokenEncryption';

export type KlikterenAuthStatus = {
  connected: boolean;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string | null;
  scoutOptIn: boolean;
};

export type KlikterenSessionTokens = {
  accessToken: string;
  refreshToken: string | null;
  externalUserId: string;
};

export type StoreKlikterenAuthInput = {
  userId: string;
  clubId: string;
  accessToken: string;
  refreshToken?: string | null;
  externalUserId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

async function assertKlikterenClub(clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, integrationType: true, integrationConfig: true },
  });
  if (!club) throw new ApiError(404, 'Club not found');
  if (club.integrationType !== ClubIntegrationType.KLIKTEREN) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.clubNotConfigured);
  }
  assertKlikterenIntegrationConfig(club.integrationType, club.integrationConfig);
  return club;
}

function toStatus(row: {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string;
  scoutOptIn: boolean;
}): KlikterenAuthStatus {
  return {
    connected: true,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    externalUserId: row.externalUserId,
    scoutOptIn: row.scoutOptIn,
  };
}

export async function getKlikterenAuthStatus(userId: string, clubId: string): Promise<KlikterenAuthStatus> {
  await assertKlikterenClub(clubId);
  const row = await prisma.userClubKlikterenAuth.findUnique({
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

export async function storeKlikterenAuth(input: StoreKlikterenAuthInput): Promise<KlikterenAuthStatus> {
  await assertKlikterenClub(input.clubId);
  const row = await prisma.userClubKlikterenAuth.upsert({
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

export async function getKlikterenSessionTokens(
  userId: string,
  clubId: string,
): Promise<KlikterenSessionTokens | null> {
  await assertKlikterenClub(clubId);
  const row = await prisma.userClubKlikterenAuth.findUnique({
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

export async function disconnectKlikterenAuth(userId: string, clubId: string): Promise<void> {
  await assertKlikterenClub(clubId);
  await prisma.userClubKlikterenAuth.deleteMany({
    where: { userId, clubId },
  });
}
