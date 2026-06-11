import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { parseBooktimeIntegrationConfig } from '../../shared/clubIntegration';

const BOOKTIME_API_URL = 'https://api.booktime.rs';

type BooktimeCompanyResource = {
  uuid?: string;
  bookingResourceId?: string;
  name?: string;
};

type BooktimeCompanyResponse = {
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

export class BooktimeImportCourtsService {
  static async importCourts(clubId: string) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { courts: true },
    });
    if (!club) throw new ApiError(404, 'Club not found');
    if (club.integrationType !== 'BOOKTIME') {
      throw new ApiError(400, 'Club integration type must be online booking');
    }

    const config = parseBooktimeIntegrationConfig(club.integrationConfig);
    if (!config?.companyId) {
      throw new ApiError(400, 'Booking provider companyId is not configured');
    }

    const res = await fetch(`${BOOKTIME_API_URL}/public/company/${config.companyId}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(502, `Booking provider company fetch failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
    }

    const payload = (await res.json()) as BooktimeCompanyResponse;
    const resources = payload.bookingResources ?? [];
    if (resources.length === 0) {
      throw new ApiError(502, 'Booking provider returned no booking resources');
    }

    const defaultSport = club.sports[0] ?? Sport.PADEL;
    const courtsByExternalId = new Map(
      club.courts
        .filter((c) => c.externalCourtId)
        .map((c) => [c.externalCourtId!, c])
    );
    const courtsByName = new Map(
      club.courts.map((c) => [normalizeCourtName(c.name), c])
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
          data: { externalCourtId, integrationCourtName: resourceName },
        });
        courtsByExternalId.set(externalCourtId, { ...byName, externalCourtId });
        updated += 1;
        continue;
      }

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
      companyName: payload.name ?? null,
      created,
      updated,
      skipped,
      courts,
    };
  }
}
