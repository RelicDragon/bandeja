import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '../../shared/booking/errorKeys';
import { ApiError } from '../../utils/ApiError';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { parseKlikterenIntegrationConfig } from '../../shared/clubIntegration';
import { syncClubSportsFromCourt } from '../../shared/clubSports';

export type KlikterenCourtImportPayload = {
  name?: string;
  courts?: Array<{
    id?: string | number;
    name?: string;
    isIndoor?: boolean;
  }>;
};

function normalizeCourtName(name: string): string {
  return name.trim().toLowerCase();
}

export class KlikterenImportCourtsService {
  static async applyImport(clubId: string, payload: KlikterenCourtImportPayload) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { courts: true },
    });
    if (!club) throw new ApiError(404, 'Club not found');
    if (club.integrationType !== 'KLIKTEREN') {
      throw new ApiError(400, BOOKING_ERROR_KEYS.integrationTypeMustBeOnlineBooking);
    }

    const config = parseKlikterenIntegrationConfig(club.integrationConfig);
    if (!config?.venueId) {
      throw new ApiError(400, BOOKING_ERROR_KEYS.klikterenVenueIdRequired);
    }

    const resources = payload.courts ?? [];
    if (resources.length === 0) {
      throw new ApiError(400, 'Klikteren returned no courts');
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
        typeof resource.id === 'string'
          ? resource.id.trim() || null
          : typeof resource.id === 'number'
            ? String(resource.id)
            : null;
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
