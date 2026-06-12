import { ClubIntegrationType } from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { UNASSIGNED_COURT_KEY } from './clubScheduleConstants';

export const BOOKTIME_SNAPSHOT_FRESH_MS = 60 * 1000;

export type BooktimeBusySlot = {
  startTime: string;
  endTime: string;
};

export type BooktimeSnapshotCourtInput = {
  courtId: string | null;
  externalCourtId: string;
  externalCourtName?: string | null;
  busySlots: BooktimeBusySlot[];
};

export function parseDateParam(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, 'date must be YYYY-MM-DD');
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, 'date is invalid');
  }
}

export function parseBusySlots(raw: unknown): BooktimeBusySlot[] {
  if (!Array.isArray(raw)) return [];
  const slots: BooktimeBusySlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const startTime = (item as Record<string, unknown>).startTime;
    const endTime = (item as Record<string, unknown>).endTime;
    if (typeof startTime !== 'string' || typeof endTime !== 'string') continue;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    slots.push({ startTime, endTime });
  }
  return slots;
}

export function formatDateKeyInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function datesInRangeForTimezone(rangeStart: Date, rangeEnd: Date, timeZone: string): string[] {
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return [];

  const startKey = formatDateKeyInTimezone(rangeStart, timeZone);
  const endKey = formatDateKeyInTimezone(rangeEnd, timeZone);
  const dates: string[] = [];

  let [y, m, d] = startKey.split('-').map(Number);
  const [endY, endM, endD] = endKey.split('-').map(Number);
  const endNum = endY * 10000 + endM * 100 + endD;

  for (let guard = 0; guard < 366; guard += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dates.push(key);
    const num = y * 10000 + m * 100 + d;
    if (num >= endNum) break;
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }

  return dates;
}

export function slotOverlapsRange(
  slotStart: Date,
  slotEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  return slotStart < rangeEnd && rangeStart < slotEnd;
}

export async function assertBooktimeClub(clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, integrationType: true },
  });
  if (!club) throw new ApiError(404, 'Club not found');
  if (club.integrationType !== ClubIntegrationType.BOOKTIME) {
    throw new ApiError(400, 'Club is not configured for online booking');
  }
  return club;
}

export type SnapshotFreshness = {
  isStale: boolean;
  latestFetchedAt: Date | null;
};

export async function getSnapshotFreshness(
  clubId: string,
  dates: string[]
): Promise<SnapshotFreshness> {
  if (dates.length === 0) {
    return { isStale: true, latestFetchedAt: null };
  }

  const rows = await prisma.clubBooktimeBusySnapshot.findMany({
    where: { clubId, date: { in: dates } },
    select: { date: true, fetchedAt: true },
  });

  const fetchedAtByDate = new Map<string, Date>();
  for (const row of rows) {
    const prev = fetchedAtByDate.get(row.date);
    if (!prev || row.fetchedAt > prev) {
      fetchedAtByDate.set(row.date, row.fetchedAt);
    }
  }

  let latestFetchedAt: Date | null = null;
  let isStale = false;
  const cutoff = Date.now() - BOOKTIME_SNAPSHOT_FRESH_MS;

  for (const date of dates) {
    const fetchedAt = fetchedAtByDate.get(date);
    if (!fetchedAt) {
      isStale = true;
      continue;
    }
    if (!latestFetchedAt || fetchedAt > latestFetchedAt) {
      latestFetchedAt = fetchedAt;
    }
    if (fetchedAt.getTime() < cutoff) {
      isStale = true;
    }
  }

  return { isStale, latestFetchedAt };
}

export async function getSnapshotDateMeta(
  clubId: string,
  date: string
): Promise<{
  snapshotFetchedAt: Date | null;
  hasSnapshotForDate: boolean;
}> {
  const rows = await prisma.clubBooktimeBusySnapshot.findMany({
    where: { clubId, date },
    select: { fetchedAt: true },
  });
  let snapshotFetchedAt: Date | null = null;
  for (const row of rows) {
    if (!snapshotFetchedAt || row.fetchedAt > snapshotFetchedAt) {
      snapshotFetchedAt = row.fetchedAt;
    }
  }
  return { snapshotFetchedAt, hasSnapshotForDate: rows.length > 0 };
}

export async function countUnmappedExternalCourts(clubId: string): Promise<number> {
  const rows = await prisma.clubBooktimeBusySnapshot.findMany({
    where: { clubId, courtId: null, externalCourtId: { not: null } },
    select: { externalCourtId: true },
    distinct: ['externalCourtId'],
  });
  return rows.length;
}

export type MergedBusySlot = {
  courtId: string | null;
  courtName: string | null;
  integrationCourtName: string | null;
  startTime: string;
  endTime: string;
};

export async function loadMergedBusySlots(options: {
  clubId: string;
  rangeStart: Date;
  rangeEnd: Date;
  filterCourtId?: string;
  includeUnmapped: boolean;
}): Promise<{ slots: MergedBusySlot[]; isLoading: boolean }> {
  const { clubId, rangeStart, rangeEnd, filterCourtId, includeUnmapped } = options;

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { city: { select: { timezone: true } } },
  });
  const timeZone = club?.city?.timezone ?? 'Europe/Belgrade';
  const dates = datesInRangeForTimezone(rangeStart, rangeEnd, timeZone);
  const { isStale } = await getSnapshotFreshness(clubId, dates);

  const rows = await prisma.clubBooktimeBusySnapshot.findMany({
    where: {
      clubId,
      date: { in: dates.length > 0 ? dates : ['__none__'] },
    },
    include: {
      court: { select: { id: true, name: true, integrationCourtName: true } },
    },
  });

  const slots: MergedBusySlot[] = [];

  for (const row of rows) {
    if (row.courtId == null) {
      if (!includeUnmapped) continue;
    } else if (filterCourtId && row.courtId !== filterCourtId) {
      continue;
    }

    const courtId =
      row.courtId == null ? UNASSIGNED_COURT_KEY : row.courtId;
    const courtName = row.court?.name ?? row.externalCourtName ?? null;
    const integrationCourtName =
      row.court?.integrationCourtName ?? row.externalCourtName ?? null;

    for (const busy of parseBusySlots(row.busySlots)) {
      const start = new Date(busy.startTime);
      const end = new Date(busy.endTime);
      if (!slotOverlapsRange(start, end, rangeStart, rangeEnd)) continue;
      slots.push({
        courtId,
        courtName,
        integrationCourtName,
        startTime: busy.startTime,
        endTime: busy.endTime,
      });
    }
  }

  return { slots, isLoading: isStale };
}
