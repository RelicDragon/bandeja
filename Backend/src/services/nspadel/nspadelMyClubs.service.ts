import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../config/database';
import { parseNspadelIntegrationConfig } from '../../shared/clubIntegration';

export type NspadelMyClubRow = {
  clubId: string;
  clubName: string;
  avatar: string | null;
  nspadelSupabaseUrl: string | null;
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

export type NspadelMyClubsPayload = {
  cityNspadelClubCount: number;
  connectedCount: number;
  clubs: NspadelMyClubRow[];
};

export async function getMyNspadelClubs(userId: string): Promise<NspadelMyClubsPayload> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });

  const auths = await prisma.userClubNspadelAuth.findMany({
    where: { userId },
    select: { clubId: true, email: true, scoutOptIn: true },
  });
  const authByClubId = new Map(auths.map((row) => [row.clubId, row]));

  const clubSelect = {
    id: true,
    name: true,
    avatar: true,
    integrationConfig: true,
    city: { select: { timezone: true } },
    courts: {
      where: { isActive: true },
      select: { id: true, name: true, externalCourtId: true, integrationCourtName: true },
      orderBy: { name: 'asc' as const },
    },
  };

  const cityClubs = user?.currentCityId
    ? await prisma.club.findMany({
        where: {
          cityId: user.currentCityId,
          integrationType: ClubIntegrationType.NSPADELSUPABASE,
          isForPlaying: true,
        },
        select: clubSelect,
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
            integrationType: ClubIntegrationType.NSPADELSUPABASE,
          },
          select: clubSelect,
          orderBy: { name: 'asc' },
        })
      : [];

  const allClubs = [...cityClubs, ...extraClubs];

  const clubs: NspadelMyClubRow[] = allClubs.map((club) => {
    const auth = authByClubId.get(club.id);
    const config = parseNspadelIntegrationConfig(club.integrationConfig);
    return {
      clubId: club.id,
      clubName: club.name,
      avatar: club.avatar,
      nspadelSupabaseUrl: config?.supabaseUrl ?? null,
      connected: !!auth,
      email: auth?.email ?? null,
      scoutOptIn: auth?.scoutOptIn ?? true,
      cityTimezone: club.city?.timezone ?? null,
      courts: club.courts,
    };
  });

  return {
    cityNspadelClubCount: cityClubs.length,
    connectedCount: auths.length,
    clubs,
  };
}
