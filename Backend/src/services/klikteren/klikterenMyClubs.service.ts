import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../config/database';
import { parseKlikterenIntegrationConfig } from '../../shared/clubIntegration';

export type KlikterenMyClubRow = {
  clubId: string;
  clubName: string;
  avatar: string | null;
  klikterenVenueId: string | null;
  connected: boolean;
  email: string | null;
  scoutOptIn: boolean;
  cityTimezone: string | null;
  courts: Array<{
    id: string;
    name: string;
    externalCourtId: string | null;
    integrationCourtName: string | null;
  }>;
};

export type KlikterenMyClubsPayload = {
  cityKlikterenClubCount: number;
  connectedCount: number;
  clubs: KlikterenMyClubRow[];
};

export async function getMyKlikterenClubs(userId: string): Promise<KlikterenMyClubsPayload> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });

  const auths = await prisma.userClubKlikterenAuth.findMany({
    where: { userId },
    select: { clubId: true, email: true, scoutOptIn: true },
  });
  const authByClubId = new Map(auths.map((row) => [row.clubId, row]));

  const cityClubs = user?.currentCityId
    ? await prisma.club.findMany({
        where: {
          cityId: user.currentCityId,
          integrationType: ClubIntegrationType.KLIKTEREN,
          isForPlaying: true,
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          integrationConfig: true,
          city: { select: { timezone: true } },
          courts: {
            where: { isActive: true },
            select: { id: true, name: true, externalCourtId: true, integrationCourtName: true },
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
            integrationType: ClubIntegrationType.KLIKTEREN,
          },
          select: {
            id: true,
            name: true,
            avatar: true,
            integrationConfig: true,
            city: { select: { timezone: true } },
            courts: {
              where: { isActive: true },
              select: { id: true, name: true, externalCourtId: true, integrationCourtName: true },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        })
      : [];

  const allClubs = [...cityClubs, ...extraClubs];

  const clubs: KlikterenMyClubRow[] = allClubs.map((club) => {
    const auth = authByClubId.get(club.id);
    const config = parseKlikterenIntegrationConfig(club.integrationConfig);
    return {
      clubId: club.id,
      clubName: club.name,
      avatar: club.avatar,
      klikterenVenueId: config?.venueId ?? null,
      connected: !!auth,
      email: auth?.email ?? null,
      scoutOptIn: auth?.scoutOptIn ?? true,
      cityTimezone: club.city?.timezone ?? null,
      courts: club.courts,
    };
  });

  return {
    cityKlikterenClubCount: cityClubs.length,
    connectedCount: auths.length,
    clubs,
  };
}
