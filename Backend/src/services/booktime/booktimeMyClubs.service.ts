import { ClubIntegrationType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { parseBooktimeIntegrationConfig } from '../../shared/clubIntegration';

export type BooktimeMyClubRow = {
  clubId: string;
  clubName: string;
  avatar: string | null;
  companyId: string | null;
  connected: boolean;
  phoneNumber: string | null;
  scoutOptIn: boolean;
  courts: Array<{ id: string; name: string; externalCourtId: string | null }>;
};

export type BooktimeMyClubsPayload = {
  cityBooktimeClubCount: number;
  connectedCount: number;
  clubs: BooktimeMyClubRow[];
};

export async function getMyBooktimeClubs(userId: string): Promise<BooktimeMyClubsPayload> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });

  const auths = await prisma.userClubBooktimeAuth.findMany({
    where: { userId },
    select: { clubId: true, phoneNumber: true, scoutOptIn: true },
  });
  const authByClubId = new Map(auths.map((row) => [row.clubId, row]));

  const cityClubs = user?.currentCityId
    ? await prisma.club.findMany({
        where: {
          cityId: user.currentCityId,
          integrationType: ClubIntegrationType.BOOKTIME,
          isForPlaying: true,
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          integrationConfig: true,
          courts: {
            where: { isActive: true },
            select: { id: true, name: true, externalCourtId: true },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      })
    : [];

  const cityClubIds = new Set(cityClubs.map((c) => c.id));
  const extraConnectedClubIds = auths
    .map((a) => a.clubId)
    .filter((clubId) => !cityClubIds.has(clubId));

  const extraClubs =
    extraConnectedClubIds.length > 0
      ? await prisma.club.findMany({
          where: {
            id: { in: extraConnectedClubIds },
            integrationType: ClubIntegrationType.BOOKTIME,
          },
          select: {
            id: true,
            name: true,
            avatar: true,
            integrationConfig: true,
            courts: {
              where: { isActive: true },
              select: { id: true, name: true, externalCourtId: true },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        })
      : [];

  const allClubs = [...cityClubs, ...extraClubs];

  const clubs: BooktimeMyClubRow[] = allClubs.map((club) => {
    const auth = authByClubId.get(club.id);
    const config = parseBooktimeIntegrationConfig(club.integrationConfig);
    return {
      clubId: club.id,
      clubName: club.name,
      avatar: club.avatar,
      companyId: config?.companyId ?? null,
      connected: !!auth,
      phoneNumber: auth?.phoneNumber ?? null,
      scoutOptIn: auth?.scoutOptIn ?? true,
      courts: club.courts,
    };
  });

  return {
    cityBooktimeClubCount: cityClubs.length,
    connectedCount: auths.length,
    clubs,
  };
}

export async function updateScoutOptIn(
  userId: string,
  clubId: string,
  scoutOptIn: boolean
): Promise<{ scoutOptIn: boolean }> {
  const updated = await prisma.userClubBooktimeAuth.updateMany({
    where: { userId, clubId },
    data: { scoutOptIn },
  });
  if (updated.count === 0) {
    throw new ApiError(404, 'BookTime connection not found');
  }
  return { scoutOptIn };
}
