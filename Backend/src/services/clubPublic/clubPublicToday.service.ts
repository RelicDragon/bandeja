/**
 * PRD 354 — "Today at a glance": per-court free/busy hours for today.
 *
 * Read-only, and read from **our own database only**. Per
 * `docs/product/constraints.md`:
 *
 *  - `CourtOccupancyService.queryExternalBlocks` merges Booktime / Padeloo /
 *    Klikteren snapshots. `NSPADELSUPABASE` is deliberately **not** in that
 *    merge, so an NSPadel club's strip shows games and club holds only; its
 *    availability lives behind `/api/nspadel/*` and is authenticated.
 *  - Klikteren is proxy-only, and no provider URL — least of all a club's
 *    Supabase URL — may ever reach the browser. This endpoint therefore returns
 *    hour buckets and a timestamp, nothing else.
 *
 * The strip is decoration: the club page must render without it, so every
 * caller treats a failure here as "no strip".
 */
import prisma from '../../config/database';
import { formatInTimeZone } from 'date-fns-tz';
import { CourtOccupancyService, isOccupancyHardBlock } from '../game/courtOccupancy.service';
import { startOfCalendarDate, endOfCalendarDate } from '../game/calendarDateBounds';
import {
  buildHourBuckets,
  markBusyHours,
  resolveClubHourWindow,
  type BusyInterval,
  type ClubTodayHour,
} from './clubPublicToday.hours';

export {
  buildHourBuckets,
  markBusyHours,
  parseClubHour,
  resolveClubHourWindow,
} from './clubPublicToday.hours';
export type { BusyInterval, ClubTodayHour, HourBucket } from './clubPublicToday.hours';

export type ClubTodayCourt = {
  courtId: string;
  name: string;
  isIndoor: boolean;
  hours: ClubTodayHour[];
  freeHours: number;
};

export type ClubTodayAvailability = {
  /** `yyyy-MM-dd` in the club's timezone. */
  date: string;
  timezone: string;
  openHour: number;
  closeHour: number;
  courts: ClubTodayCourt[];
  /** ISO timestamp of the newest provider snapshot for today, or null. */
  updatedAt: string | null;
};

async function latestSnapshotFetchedAt(
  clubId: string,
  integrationType: string | null,
  dateKey: string,
): Promise<string | null> {
  const where = { clubId, date: dateKey };
  const pick = (row: { fetchedAt: Date } | null): string | null =>
    row ? row.fetchedAt.toISOString() : null;

  switch (integrationType) {
    case 'BOOKTIME':
      return pick(
        await prisma.clubBooktimeBusySnapshot.findFirst({
          where,
          select: { fetchedAt: true },
          orderBy: { fetchedAt: 'desc' },
        }),
      );
    case 'PADELOO':
      return pick(
        await prisma.clubPadelooBusySnapshot.findFirst({
          where,
          select: { fetchedAt: true },
          orderBy: { fetchedAt: 'desc' },
        }),
      );
    case 'KLIKTEREN':
      return pick(
        await prisma.clubKlikterenBusySnapshot.findFirst({
          where,
          select: { fetchedAt: true },
          orderBy: { fetchedAt: 'desc' },
        }),
      );
    case 'NSPADELSUPABASE':
      return pick(
        await prisma.clubNspadelBusySnapshot.findFirst({
          where,
          select: { fetchedAt: true },
          orderBy: { fetchedAt: 'desc' },
        }),
      );
    default:
      return null;
  }
}

export async function getClubTodayAvailability(clubId: string): Promise<ClubTodayAvailability> {
  const club = await prisma.club.findFirst({
    where: { id: clubId, isActive: true },
    select: {
      id: true,
      openingTime: true,
      closingTime: true,
      integrationType: true,
      city: { select: { timezone: true } },
      courts: {
        where: { isActive: true },
        select: { id: true, name: true, isIndoor: true },
        orderBy: { name: 'asc' },
      },
    },
  });

  const timezone = club?.city?.timezone ?? 'UTC';
  const dateKey = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
  const { openHour, closeHour } = resolveClubHourWindow(club?.openingTime, club?.closingTime);

  if (!club || club.courts.length === 0) {
    return { date: dateKey, timezone, openHour, closeHour, courts: [], updatedAt: null };
  }

  const dayStart = startOfCalendarDate(dateKey, timezone);
  const dayEnd = endOfCalendarDate(dateKey, timezone);
  const buckets = buildHourBuckets(dateKey, timezone, openHour, closeHour);

  const [occupancy, updatedAt] = await Promise.all([
    CourtOccupancyService.getOccupancy({
      clubId,
      rangeStart: dayStart,
      rangeEnd: dayEnd,
      includeUnmapped: false,
    }),
    latestSnapshotFetchedAt(clubId, club.integrationType, dateKey).catch(() => null),
  ]);

  const intervalsByCourt = new Map<string, BusyInterval[]>();
  for (const block of occupancy.blocks) {
    if (!block.courtId) continue;
    // Soft blocks (a game without a booked court) must not paint a court grey —
    // the court is still bookable.
    if (!isOccupancyHardBlock(block)) continue;
    const start = Date.parse(block.startTime);
    const end = Date.parse(block.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const list = intervalsByCourt.get(block.courtId) ?? [];
    list.push({ start, end });
    intervalsByCourt.set(block.courtId, list);
  }

  const courts: ClubTodayCourt[] = club.courts.map((court) => {
    const hours = markBusyHours(buckets, intervalsByCourt.get(court.id) ?? []);
    return {
      courtId: court.id,
      name: court.name,
      isIndoor: court.isIndoor,
      hours,
      freeHours: hours.filter((h) => !h.busy).length,
    };
  });

  return { date: dateKey, timezone, openHour, closeHour, courts, updatedAt };
}
