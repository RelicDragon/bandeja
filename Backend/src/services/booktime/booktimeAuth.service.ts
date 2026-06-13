import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { ApiError } from '../../utils/ApiError';
import { assertBooktimeIntegrationConfig } from '../../shared/clubIntegration';
import { decryptToken, encryptToken } from '../../utils/tokenEncryption';

const SCOUT_INVALID_SKIP_MS = 24 * 60 * 60 * 1000;

export type BooktimeAuthStatus = {
  connected: boolean;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string | null;
  scoutOptIn: boolean;
};

export type BooktimeSessionTokens = {
  accessToken: string;
  refreshToken: string;
  externalUserId: string;
  expiresAt: Date | null;
};

export type StoreBooktimeAuthInput = {
  userId: string;
  clubId: string;
  accessToken: string;
  refreshToken: string;
  externalUserId: string;
  phoneNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  expiresAt?: Date | null;
};

async function assertBooktimeClub(clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, integrationType: true, integrationConfig: true },
  });
  if (!club) throw new ApiError(404, 'Club not found');
  if (club.integrationType !== ClubIntegrationType.BOOKTIME) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.clubNotConfigured);
  }
  assertBooktimeIntegrationConfig(club.integrationType, club.integrationConfig);
  return club;
}

function toStatus(row: {
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string;
  scoutOptIn: boolean;
}): BooktimeAuthStatus {
  return {
    connected: true,
    phoneNumber: row.phoneNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    externalUserId: row.externalUserId,
    scoutOptIn: row.scoutOptIn,
  };
}

export async function getBooktimeAuthStatus(userId: string, clubId: string): Promise<BooktimeAuthStatus> {
  await assertBooktimeClub(clubId);
  const row = await prisma.userClubBooktimeAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: { phoneNumber: true, firstName: true, lastName: true, externalUserId: true, scoutOptIn: true },
  });
  if (!row) {
    return {
      connected: false,
      phoneNumber: null,
      firstName: null,
      lastName: null,
      externalUserId: null,
      scoutOptIn: true,
    };
  }
  return toStatus(row);
}

export async function storeBooktimeAuth(input: StoreBooktimeAuthInput): Promise<BooktimeAuthStatus> {
  await assertBooktimeClub(input.clubId);
  const row = await prisma.userClubBooktimeAuth.upsert({
    where: { userId_clubId: { userId: input.userId, clubId: input.clubId } },
    create: {
      userId: input.userId,
      clubId: input.clubId,
      externalUserId: input.externalUserId,
      phoneNumber: input.phoneNumber ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      accessToken: encryptToken(input.accessToken),
      refreshToken: encryptToken(input.refreshToken),
      expiresAt: input.expiresAt ?? null,
      scoutOptIn: true,
      scoutInvalidAt: null,
    },
    update: {
      externalUserId: input.externalUserId,
      phoneNumber: input.phoneNumber ?? null,
      ...(input.firstName !== undefined ? { firstName: input.firstName ?? null } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName ?? null } : {}),
      accessToken: encryptToken(input.accessToken),
      refreshToken: encryptToken(input.refreshToken),
      expiresAt: input.expiresAt ?? null,
      scoutInvalidAt: null,
    },
    select: { phoneNumber: true, firstName: true, lastName: true, externalUserId: true, scoutOptIn: true },
  });
  return toStatus(row);
}

export async function getBooktimeSessionTokens(
  userId: string,
  clubId: string
): Promise<BooktimeSessionTokens | null> {
  await assertBooktimeClub(clubId);
  const row = await prisma.userClubBooktimeAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: {
      accessToken: true,
      refreshToken: true,
      externalUserId: true,
      expiresAt: true,
    },
  });
  if (!row) return null;
  return {
    accessToken: decryptToken(row.accessToken),
    refreshToken: decryptToken(row.refreshToken),
    externalUserId: row.externalUserId,
    expiresAt: row.expiresAt,
  };
}

export async function disconnectBooktimeAuth(userId: string, clubId: string): Promise<void> {
  await assertBooktimeClub(clubId);
  await prisma.userClubBooktimeAuth.deleteMany({
    where: { userId, clubId },
  });
}

/** Scout pool (#111): eligible rows excluding requester; skips recent 401 tokens. */
export async function listScoutEligibleAuths(clubId: string, excludeUserId: string) {
  const cutoff = new Date(Date.now() - SCOUT_INVALID_SKIP_MS);
  return prisma.userClubBooktimeAuth.findMany({
    where: {
      clubId,
      scoutOptIn: true,
      userId: { not: excludeUserId },
      OR: [{ scoutInvalidAt: null }, { scoutInvalidAt: { lt: cutoff } }],
    },
    select: { id: true, userId: true, accessToken: true, scoutInvalidAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getDecryptedAccessTokenForAuth(authId: string): Promise<string | null> {
  const row = await prisma.userClubBooktimeAuth.findUnique({
    where: { id: authId },
    select: { accessToken: true },
  });
  if (!row) return null;
  return decryptToken(row.accessToken);
}

export async function markScoutInvalid(authId: string): Promise<void> {
  await prisma.userClubBooktimeAuth.updateMany({
    where: { id: authId },
    data: { scoutInvalidAt: new Date() },
  });
}

export async function getScoutAuthForClub(clubId: string, authId: string) {
  return prisma.userClubBooktimeAuth.findFirst({
    where: { id: authId, clubId },
    select: { id: true },
  });
}

export async function pickScoutAccessToken(
  clubId: string,
  excludeUserId: string,
  options?: { maxAttempts?: number; excludeAuthIds?: string[] }
): Promise<{ authId: string; accessToken: string } | null> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const exclude = new Set(options?.excludeAuthIds ?? []);
  const candidates = (await listScoutEligibleAuths(clubId, excludeUserId)).filter(
    (row) => !exclude.has(row.id)
  );
  for (let i = 0; i < Math.min(maxAttempts, candidates.length); i += 1) {
    const candidate = candidates[i];
    const accessToken = decryptToken(candidate.accessToken);
    return { authId: candidate.id, accessToken };
  }
  return null;
}
