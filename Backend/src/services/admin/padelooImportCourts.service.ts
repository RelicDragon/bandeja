import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '../../shared/booking/errorKeys';
import { ApiError } from '../../utils/ApiError';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { parsePadelooIntegrationConfig } from '../../shared/clubIntegration';
import { syncClubSportsFromCourt } from '../../shared/clubSports';

export type PadelooCourtImportPayload = {
  name?: string;
  courts?: Array<{
    id?: number;
    name?: string;
    isIndoor?: boolean;
  }>;
};

function normalizeCourtName(name: string): string {
  return name.trim().toLowerCase();
}

export class PadelooImportCourtsService {
  static async applyImport(clubId: string, payload: PadelooCourtImportPayload) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { courts: true },
    });
    if (!club) throw new ApiError(404, 'Club not found');
    if (club.integrationType !== 'PADELOO') {
      throw new ApiError(400, BOOKING_ERROR_KEYS.integrationTypeMustBeOnlineBooking);
    }

    const config = parsePadelooIntegrationConfig(club.integrationConfig);
    if (!config?.clubId) {
      throw new ApiError(400, BOOKING_ERROR_KEYS.padelooClubIdRequired);
    }

    const resources = payload.courts ?? [];
    if (resources.length === 0) {
      throw new ApiError(400, 'Padeloo returned no courts');
    }

    const defaultSport = club.sports[0] ?? Sport.PADEL;
    const courtsByExternalId = new Map(
      club.courts
        .filter((c) => c.externalCourtId)
        .map((c) => [c.externalCourtId!, c]),
    );
    const courtsByName = new Map(
      club.courts.map((c) => [normalizeCourtName(c.name), c]),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const resource of resources) {
      const externalCourtId =
        typeof resource.id === 'number' ? String(resource.id) : null;
      const resourceName = typeof resource.name === 'string' ? resource.name.trim() : '';
      if (!externalCourtId || !resourceName) {
        skipped += 1;
        continue;
      }

      const byExternal = courtsByExternalId.get(externalCourtId);
      if (byExternal) {
        const needsLink = !byExternal.externalCourtId;
        const needsIntegrationName = byExternal.integrationCourtName !== resourceName;
        if (needsLink || needsIntegrationName) {
          await prisma.court.update({
            where: { id: byExternal.id },
            data: {
              ...(needsLink ? { externalCourtId } : {}),
              integrationCourtName: resourceName,
            },
          });
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const byName = courtsByName.get(normalizeCourtName(resourceName));
      if (byName) {
        await prisma.court.update({
          where: { id: byName.id },
          data: {
            externalCourtId,
            integrationCourtName: resourceName,
          },
        });
        courtsByExternalId.set(externalCourtId, { ...byName, externalCourtId });
        updated += 1;
        continue;
      }

      await syncClubSportsFromCourt(clubId, defaultSport);
      const court = await prisma.court.create({
        data: {
          clubId,
          name: resourceName,
          externalCourtId,
          integrationCourtName: resourceName,
          sport: defaultSport,
          isActive: true,
        },
      });
      courtsByExternalId.set(externalCourtId, court);
      courtsByName.set(normalizeCourtName(resourceName), court);
      created += 1;
    }

    await refreshClubCourtsCount(clubId);

    const courts = await prisma.court.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });

    return {
      clubName: payload.name ?? null,
      created,
      updated,
      skipped,
      courts,
    };
  }
}
