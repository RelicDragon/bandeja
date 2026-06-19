import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { BOOKING_ERROR_KEYS } from '../../shared/booking/errorKeys';
import {
  courtNamesConflictForSport,
  inferCourtSportFromBooktimeResource,
  tennisCourtDisplayName,
  type BooktimeResourceForSport,
} from '../../shared/booktime/inferCourtSport';
import { ApiError } from '../../utils/ApiError';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { parseBooktimeIntegrationConfig } from '../../shared/clubIntegration';
import { syncClubSportsFromCourt } from '../../shared/clubSports';

export type BooktimeCompanyResource = BooktimeResourceForSport & {
  uuid?: string;
  bookingResourceId?: string;
};

export type BooktimeCompanyImportPayload = {
  name?: string;
  bookingResources?: BooktimeCompanyResource[];
};

function resourceExternalId(resource: BooktimeCompanyResource): string | null {
  const id = resource.bookingResourceId ?? resource.uuid;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function normalizeCourtName(name: string): string {
  return name.trim().toLowerCase();
}

function resolveImportedCourtName(
  resourceName: string,
  inferredSport: Sport | null,
  courtsByName: Map<string, { id: string; sport: Sport | null }>,
): string {
  if (inferredSport === Sport.TENNIS) {
    const tennisName = tennisCourtDisplayName(resourceName);
    if (!courtsByName.has(normalizeCourtName(tennisName))) {
      return tennisName;
    }
  }

  const normalizedResourceName = normalizeCourtName(resourceName);
  const existing = courtsByName.get(normalizedResourceName);
  if (!existing) return resourceName;
  if (!courtNamesConflictForSport(existing.sport, inferredSport)) return resourceName;
  if (inferredSport === Sport.TENNIS) return tennisCourtDisplayName(resourceName);
  return `${resourceName} (${inferredSport ?? 'Multi'})`;
}

export class BooktimeImportCourtsService {
  static async applyImport(clubId: string, payload: BooktimeCompanyImportPayload) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { courts: true },
    });
    if (!club) throw new ApiError(404, 'Club not found');
    if (club.integrationType !== 'BOOKTIME') {
      throw new ApiError(400, BOOKING_ERROR_KEYS.integrationTypeMustBeOnlineBooking);
    }

    const config = parseBooktimeIntegrationConfig(club.integrationConfig);
    if (!config?.companyId) {
      throw new ApiError(400, 'Booking provider companyId is not configured');
    }

    const resources = payload.bookingResources ?? [];
    if (resources.length === 0) {
      throw new ApiError(400, 'Booking provider returned no booking resources');
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
      const externalCourtId = resourceExternalId(resource);
      const resourceName = typeof resource.name === 'string' ? resource.name.trim() : '';
      if (!externalCourtId || !resourceName) {
        skipped += 1;
        continue;
      }

      const inferredSport = inferCourtSportFromBooktimeResource(resource, defaultSport);
      const byExternal = courtsByExternalId.get(externalCourtId);
      if (byExternal) {
        const needsLink = !byExternal.externalCourtId;
        const needsIntegrationName = byExternal.integrationCourtName !== resourceName;
        const needsSport = byExternal.sport !== inferredSport;
        if (needsLink || needsIntegrationName || needsSport) {
          await prisma.court.update({
            where: { id: byExternal.id },
            data: {
              ...(needsLink ? { externalCourtId } : {}),
              integrationCourtName: resourceName,
              ...(needsSport ? { sport: inferredSport } : {}),
            },
          });
          if (needsSport && inferredSport != null) {
            await syncClubSportsFromCourt(clubId, inferredSport);
          }
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const byName = courtsByName.get(normalizeCourtName(resourceName));
      if (byName && !courtNamesConflictForSport(byName.sport, inferredSport)) {
        await prisma.court.update({
          where: { id: byName.id },
          data: {
            externalCourtId,
            integrationCourtName: resourceName,
            sport: inferredSport,
          },
        });
        if (inferredSport != null) {
          await syncClubSportsFromCourt(clubId, inferredSport);
        }
        courtsByExternalId.set(externalCourtId, { ...byName, externalCourtId, sport: inferredSport });
        updated += 1;
        continue;
      }

      const displayName = resolveImportedCourtName(resourceName, inferredSport, courtsByName);
      if (inferredSport != null) {
        await syncClubSportsFromCourt(clubId, inferredSport);
      }
      const court = await prisma.court.create({
        data: {
          clubId,
          name: displayName,
          externalCourtId,
          integrationCourtName: resourceName,
          sport: inferredSport,
          isActive: true,
        },
      });
      courtsByExternalId.set(externalCourtId, court);
      courtsByName.set(normalizeCourtName(displayName), court);
      created += 1;
    }

    await refreshClubCourtsCount(clubId);

    const courts = await prisma.court.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });

    return {
      companyName: payload.name ?? null,
      created,
      updated,
      skipped,
      courts,
    };
  }
}
