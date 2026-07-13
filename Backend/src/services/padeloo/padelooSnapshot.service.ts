import { Prisma, ClubIntegrationType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  parseBusySlots,
  parseDateParam,
} from '../../shared/booktimeBusySnapshot';
import {
  prepareSnapshotCourtsForStorage,
  type SnapshotCourtLookupRow,
} from '../../shared/booktimeSnapshotCourtResolve';
import { assertSnapshotPutRateLimit, BOOKTIME_SNAPSHOT_PUT_COOLDOWN_MS } from '../booktime/booktimeSnapshot.rateLimit';
import {
  parseCourtsInput,
  parseFetchedAt,
  type SnapshotResponse,
} from '../booking/snapshotStorage';

export type PadelooSnapshotResponse = SnapshotResponse;

async function assertPadelooClub(clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, integrationType: true },
  });
  if (!club) throw new ApiError(404, 'Club not found');
  if (club.integrationType !== ClubIntegrationType.PADELOO) {
    throw new ApiError(400, 'Club is not configured for Padeloo');
  }
  return club;
}

async function loadActiveClubCourts(clubId: string): Promise<SnapshotCourtLookupRow[]> {
  return prisma.court.findMany({
    where: { clubId, isActive: true },
    select: {
      id: true,
      name: true,
      externalCourtId: true,
      integrationCourtName: true,
    },
  });
}

export async function getPadelooSnapshot(
  clubId: string,
  date: string,
): Promise<PadelooSnapshotResponse> {
  await assertPadelooClub(clubId);
  parseDateParam(date);

  const rows = await prisma.clubPadelooBusySnapshot.findMany({
    where: { clubId, date },
    orderBy: [{ courtId: 'asc' }, { externalCourtId: 'asc' }],
  });

  let fetchedAt: Date | null = null;
  for (const row of rows) {
    if (!fetchedAt || row.fetchedAt > fetchedAt) {
      fetchedAt = row.fetchedAt;
    }
  }

  return {
    date,
    fetchedAt: fetchedAt?.toISOString() ?? null,
    courts: rows.map((row) => ({
      courtId: row.courtId,
      externalCourtId: row.externalCourtId,
      externalCourtName: row.externalCourtName,
      busySlots: parseBusySlots(row.busySlots),
    })),
  };
}

export async function replacePadelooSnapshot(
  userId: string,
  clubId: string,
  input: {
    date: string;
    fetchedAt: unknown;
    force?: boolean;
    courts: unknown;
  },
): Promise<PadelooSnapshotResponse> {
  await assertPadelooClub(clubId);
  parseDateParam(input.date);
  const fetchedAt = parseFetchedAt(input.fetchedAt);
  const dbCourts = await loadActiveClubCourts(clubId);
  const courts = prepareSnapshotCourtsForStorage(parseCourtsInput(input.courts), dbCourts);
  const force = input.force === true;

  const existing = await prisma.clubPadelooBusySnapshot.findMany({
    where: { clubId, date: input.date },
    select: { fetchedAt: true },
  });

  if (!force && existing.length > 0) {
    const latest = existing.reduce(
      (max, row) => (row.fetchedAt > max ? row.fetchedAt : max),
      existing[0].fetchedAt,
    );
    if (Date.now() - latest.getTime() < BOOKTIME_SNAPSHOT_PUT_COOLDOWN_MS) {
      throw new ApiError(429, 'Snapshot was refreshed recently; use force to override');
    }
  }

  assertSnapshotPutRateLimit(userId, clubId, input.date, force);

  const courtIds = courts.map((c) => c.courtId).filter((id): id is string => id != null);
  if (courtIds.length > 0) {
    const validCourts = await prisma.court.count({
      where: { clubId, id: { in: courtIds } },
    });
    if (validCourts !== new Set(courtIds).size) {
      throw new ApiError(400, 'One or more courtId values do not belong to this club');
    }
  }

  const createRows: Prisma.ClubPadelooBusySnapshotCreateManyInput[] = courts.map((court) => ({
    clubId,
    courtId: court.courtId,
    externalCourtId: court.externalCourtId,
    externalCourtName: court.externalCourtName,
    date: input.date,
    busySlots: court.busySlots,
    fetchedAt,
  }));

  const snapshotLockKey = `${clubId}:${input.date}`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${snapshotLockKey}::text))`,
    );
    await tx.clubPadelooBusySnapshot.deleteMany({
      where: { clubId, date: input.date },
    });
    if (createRows.length > 0) {
      await tx.clubPadelooBusySnapshot.createMany({ data: createRows });
    }
  });

  const rows = await prisma.clubPadelooBusySnapshot.findMany({
    where: { clubId, date: input.date },
    orderBy: [{ courtId: 'asc' }, { externalCourtId: 'asc' }],
  });

  let latestFetchedAt: Date | null = null;
  for (const row of rows) {
    if (!latestFetchedAt || row.fetchedAt > latestFetchedAt) {
      latestFetchedAt = row.fetchedAt;
    }
  }

  return {
    date: input.date,
    fetchedAt: latestFetchedAt?.toISOString() ?? null,
    courts: rows.map((row) => ({
      courtId: row.courtId,
      externalCourtId: row.externalCourtId,
      externalCourtName: row.externalCourtName,
      busySlots: parseBusySlots(row.busySlots),
    })),
  };
}
