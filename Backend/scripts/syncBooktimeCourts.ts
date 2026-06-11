import dotenv from 'dotenv';
dotenv.config();

import { ClubIntegrationType, PrismaClient } from '@prisma/client';
import prisma from '../src/config/database';
import { parseBooktimeIntegrationConfig } from '../src/shared/clubIntegration';
import { refreshClubCourtsCount } from '../src/utils/refreshClubCourtsCount';

const BOOKTIME_API_URL = 'https://api.booktime.rs';

type BooktimeResource = {
  uuid?: string;
  bookingResourceId?: string;
  name?: string;
};

type BooktimeCompanyResponse = {
  name?: string;
  bookingResources?: BooktimeResource[];
};

function resourceExternalId(resource: BooktimeResource): string | null {
  const id = resource.bookingResourceId ?? resource.uuid;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function isGenericCourtName(name: string): boolean {
  return /^court\s*\d+/i.test(name.trim());
}

function isBooktimeUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isMappedExternalId(id: string | null | undefined): boolean {
  return isBooktimeUuid(id);
}

function courtSortKey(name: string): number {
  const central = /central/i.test(name);
  const n = name.match(/(\d+)/);
  if (central) return 10_000;
  return n ? parseInt(n[1], 10) : 9_999;
}

function dedupeResourcesByName(resources: BooktimeResource[]): BooktimeResource[] {
  const seen = new Set<string>();
  const out: BooktimeResource[] = [];
  for (const resource of resources) {
    const name = typeof resource.name === 'string' ? resource.name.trim() : '';
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resource);
  }
  return out;
}

async function fetchCompanyResources(companyId: string): Promise<BooktimeResource[]> {
  const res = await fetch(`${BOOKTIME_API_URL}/public/company/${companyId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BookTime company fetch failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  const payload = (await res.json()) as BooktimeCompanyResponse;
  return payload.bookingResources ?? [];
}

async function hasIntegrationCourtNameColumn(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'padelpulse'
      AND table_name = 'Court'
      AND column_name = 'integrationCourtName'
  `;
  return rows.length > 0;
}

async function syncClub(
  prisma: PrismaClient,
  clubId: string,
  clubName: string,
  companyId: string,
  supportsIntegrationCourtName: boolean
) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      courts: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          clubId: true,
          externalCourtId: true,
          ...(supportsIntegrationCourtName ? { integrationCourtName: true } : {}),
        },
      },
    },
  });
  if (!club) throw new Error(`Club not found: ${clubId}`);

  const resources = await fetchCompanyResources(companyId);

  let positionalUpdated = 0;
  let nameUpdated = 0;
  let skipped = 0;

  const courtsByExternalId = new Map(
    club.courts
      .filter((c) => isMappedExternalId(c.externalCourtId))
      .map((c) => [c.externalCourtId!, c])
  );
  const courtsByName = new Map(club.courts.map((c) => [normalizeName(c.name), c]));

  const unmappedGenericCourts = club.courts
    .filter((c) => !isMappedExternalId(c.externalCourtId) && isGenericCourtName(c.name))
    .sort((a, b) => courtSortKey(a.name) - courtSortKey(b.name));

  if (unmappedGenericCourts.length > 0) {
    const pool =
      clubName.includes('KSC') || unmappedGenericCourts.length >= 6
        ? resources
        : dedupeResourcesByName(resources);
    const sortedResources = [...pool]
      .filter((r) => resourceExternalId(r) && typeof r.name === 'string' && r.name.trim())
      .sort((a, b) => courtSortKey(a.name ?? '') - courtSortKey(b.name ?? ''));

    if (sortedResources.length >= unmappedGenericCourts.length) {
      for (let i = 0; i < unmappedGenericCourts.length; i += 1) {
        const court = unmappedGenericCourts[i];
        const resource = sortedResources[i];
        const externalCourtId = resourceExternalId(resource)!;
        const integrationCourtName = resource.name!.trim();
        await prisma.court.update({
          where: { id: court.id },
          data: {
            externalCourtId,
            ...(supportsIntegrationCourtName ? { integrationCourtName } : {}),
          },
        });
        courtsByExternalId.set(externalCourtId, { ...court, externalCourtId });
        positionalUpdated += 1;
      }
    }
  }

  for (const resource of resources) {
    const externalCourtId = resourceExternalId(resource);
    const resourceName = typeof resource.name === 'string' ? resource.name.trim() : '';
    if (!externalCourtId || !resourceName) {
      skipped += 1;
      continue;
    }

    const byExternal = courtsByExternalId.get(externalCourtId);
    if (byExternal) {
      const currentIntegrationName = supportsIntegrationCourtName
        ? (byExternal as { integrationCourtName?: string | null }).integrationCourtName
        : null;
      if (supportsIntegrationCourtName && currentIntegrationName !== resourceName) {
        await prisma.court.update({
          where: { id: byExternal.id },
          data: { integrationCourtName: resourceName },
        });
        nameUpdated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const byName = courtsByName.get(normalizeName(resourceName));
    if (byName && !isMappedExternalId(byName.externalCourtId)) {
      await prisma.court.update({
        where: { id: byName.id },
        data: {
          externalCourtId,
          ...(supportsIntegrationCourtName ? { integrationCourtName: resourceName } : {}),
        },
      });
      courtsByExternalId.set(externalCourtId, { ...byName, externalCourtId });
      nameUpdated += 1;
      continue;
    }

    skipped += 1;
  }

  await refreshClubCourtsCount(clubId);

  const mapped = await prisma.court.count({
    where: { clubId, isActive: true, externalCourtId: { not: null } },
  });
  const total = await prisma.court.count({ where: { clubId, isActive: true } });

  return { clubName, positionalUpdated, nameUpdated, skipped, mapped, total };
}

async function main() {
  const supportsIntegrationCourtName = await hasIntegrationCourtNameColumn(prisma);

  const clubs = await prisma.club.findMany({
    where: { integrationType: ClubIntegrationType.BOOKTIME, isActive: true },
    orderBy: { name: 'asc' },
  });

  const results = [];
  for (const club of clubs) {
    const config = parseBooktimeIntegrationConfig(club.integrationConfig);
    if (!config?.companyId) {
      console.warn(`SKIP ${club.name}: missing companyId`);
      continue;
    }
    const result = await syncClub(
      prisma,
      club.id,
      club.name,
      config.companyId,
      supportsIntegrationCourtName
    );
    results.push(result);
    console.log(JSON.stringify(result));
  }

  await prisma.$disconnect();
  return results;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
