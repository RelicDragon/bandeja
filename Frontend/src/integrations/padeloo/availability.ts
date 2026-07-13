import { padelooApi } from '@/api/padeloo';
import type { Club, Court } from '@/types';
import { PadelooClient } from '@/integrations/padeloo/client';
import { computeFreeSlotsForCourt } from '@/integrations/booktime/slots';
import {
  availableSlotsToRangeStrings,
  formatClubDateKey,
  type PadelooBookingDuration,
  type PadelooBusyInterval,
} from '@/integrations/padeloo/slots';
import { clubLocalDateString, clubLocalNowMinutes } from '@/utils/clubAdmin/scheduleTime';
import { getPadelooClubId, isPadelooClub } from '@shared/clubIntegration';
import { PADELOO_BOOKING_DURATIONS } from '@/integrations/padeloo/config';

export type PadelooCourtAvailabilityRow = {
  court: Court;
  externalCourtId: string;
  freeSlots: string[];
};

export type PadelooAvailabilityRawData = {
  busyByCourtId: Map<string, PadelooBusyInterval[]>;
  publicSlotsByExternalId: Map<string, string[]>;
};

export type PadelooAvailabilityClubMeta = {
  durations: PadelooBookingDuration[];
  bookableDays: number;
};

export type PadelooCourtAvailabilityFetchResult = {
  dateKey: string;
  raw: PadelooAvailabilityRawData;
  companyMeta?: PadelooAvailabilityClubMeta;
};

const DEFAULT_BOOKABLE_DAYS = 7;

export function mappedPadelooCourts(club: Club, courts?: Court[]): Court[] {
  const source = courts ?? club.courts ?? [];
  return source
    .filter((c) => typeof c.externalCourtId === 'string' && c.externalCourtId.trim())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function filterPastSlots(slotStarts: string[], dateKey: string, club: Club): string[] {
  const todayKey = clubLocalDateString(club);
  if (dateKey !== todayKey) return slotStarts;
  const nowMinutes = clubLocalNowMinutes(club);
  return slotStarts.filter((start) => {
    const minutes = parseSlotMinutes(start);
    return minutes != null && minutes >= nowMinutes;
  });
}

export function parseSlotMinutes(time: string): number | null {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function buildBusyByCourtId(
  snapshotCourts: Array<{ courtId?: string | null; busySlots?: PadelooBusyInterval[] }> | undefined,
): Map<string, PadelooBusyInterval[]> {
  const busyMap = new Map<string, PadelooBusyInterval[]>();
  for (const row of snapshotCourts ?? []) {
    if (row.courtId) {
      busyMap.set(row.courtId, row.busySlots ?? []);
    }
  }
  return busyMap;
}

export function buildPublicSlotsByExternalId(
  slotRows: Array<{ courtId?: number; slots?: Array<{ startTime: string; endTime: string }> }> | undefined | null,
): Map<string, string[]> {
  const publicMap = new Map<string, string[]>();
  for (const row of slotRows ?? []) {
    if (typeof row.courtId === 'number') {
      publicMap.set(String(row.courtId), availableSlotsToRangeStrings(row.slots ?? []));
    }
  }
  return publicMap;
}

export function computeCourtAvailabilityRows(params: {
  club: Club;
  courts: Court[];
  raw: PadelooAvailabilityRawData;
  durationMinutes: number;
  dateKey: string;
  courtFilter?: string | null;
}): PadelooCourtAvailabilityRow[] {
  const { club, courts, raw, durationMinutes, dateKey, courtFilter } = params;
  const targetCourts = courtFilter ? courts.filter((court) => court.id === courtFilter) : courts;

  return targetCourts.map((court) => {
    const externalCourtId = court.externalCourtId!.trim();
    const ranges = raw.publicSlotsByExternalId.get(externalCourtId) ?? [];
    const busy = raw.busyByCourtId.get(court.id) ?? [];
    const freeSlots = filterPastSlots(
      computeFreeSlotsForCourt(ranges, busy, durationMinutes, club, dateKey),
      dateKey,
      club,
    );
    return { court, externalCourtId, freeSlots };
  });
}

export function resolvePadelooDateBounds(club: Club, bookableDays: number): {
  minDateKey: string;
  maxDateKey: string;
} {
  const minDateKey = clubLocalDateString(club);
  const [y, m, d] = minDateKey.split('-').map(Number);
  const max = new Date(y, m - 1, d + bookableDays - 1, 12, 0, 0);
  return {
    minDateKey,
    maxDateKey: formatClubDateKey(max, club),
  };
}

export async function fetchPadelooCourtAvailabilityForDate(params: {
  club: Club;
  padelooClubId: number;
  date: Date;
  durationMinutes: number;
  loadClubMeta?: boolean;
}): Promise<PadelooCourtAvailabilityFetchResult> {
  const { club, padelooClubId, date, durationMinutes, loadClubMeta = false } = params;
  const dateKey = formatClubDateKey(date, club);
  const client = new PadelooClient({ padelooClubId });

  const clubPromise = loadClubMeta ? client.getClub(padelooClubId) : Promise.resolve(null);
  const [snapshotRes, slotsRes, padelooClub] = await Promise.all([
    padelooApi.getSnapshot(club.id, dateKey),
    client.getAvailableSlots(padelooClubId, dateKey, durationMinutes),
    clubPromise,
  ]);

  const raw: PadelooAvailabilityRawData = {
    busyByCourtId: buildBusyByCourtId(snapshotRes.data?.courts),
    publicSlotsByExternalId: buildPublicSlotsByExternalId(slotsRes),
  };

  let companyMeta: PadelooAvailabilityClubMeta | undefined;
  if (loadClubMeta) {
    const bookableDays =
      typeof padelooClub?.defaultAdvanceBookingDays === 'number' && padelooClub.defaultAdvanceBookingDays > 0
        ? padelooClub.defaultAdvanceBookingDays
        : DEFAULT_BOOKABLE_DAYS;
    companyMeta = {
      durations: [...PADELOO_BOOKING_DURATIONS],
      bookableDays,
    };
  }

  return { dateKey, raw, companyMeta };
}

export function isPadelooClubWithConfig(club: Club | undefined): club is Club {
  return isPadelooClub(club) && getPadelooClubId(club) != null;
}
