import { booktimeApi } from '@/api/booktime';
import type { Club, Court } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import {
  pickClosestDurationOption,
  resolveBooktimeDurationsMinutes,
} from '@/integrations/booktime/durations';
import {
  type BooktimeBookingDuration,
  type BooktimeBusyInterval,
  computeFreeSlotsForCourt,
  formatClubDateKey,
} from '@/integrations/booktime/slots';
import { clubLocalDateString, clubLocalNowMinutes } from '@/utils/clubAdmin/scheduleTime';
import { DEFAULT_BOOKABLE_DAYS } from '@/hooks/useBooktimeCompanyMeta';

export type BooktimeCourtAvailabilityRow = {
  court: Court;
  externalCourtId: string;
  freeSlots: string[];
};

export type BooktimeAvailabilityRawData = {
  busyByCourtId: Map<string, BooktimeBusyInterval[]>;
  publicSlotsByExternalId: Map<string, string[]>;
};

export type BooktimeAvailabilityCompanyMeta = {
  durations: BooktimeBookingDuration[];
  bookableDays: number;
};

export type BooktimeCourtAvailabilityFetchResult = {
  dateKey: string;
  raw: BooktimeAvailabilityRawData;
  companyMeta?: BooktimeAvailabilityCompanyMeta;
};

export function mappedBooktimeCourts(club: Club, courts?: Court[]): Court[] {
  const source = courts ?? club.courts ?? [];
  return source
    .filter((c) => typeof c.externalCourtId === 'string' && c.externalCourtId.trim())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function booktimeCourtMappingKey(courts: Court[] | undefined, club: Club | undefined): string {
  const source = courts ?? club?.courts ?? [];
  return source
    .filter((c) => typeof c.externalCourtId === 'string' && c.externalCourtId.trim())
    .map((c) => `${c.id}:${c.externalCourtId!.trim()}`)
    .sort()
    .join('|');
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
  snapshotCourts: Array<{ courtId?: string | null; busySlots?: BooktimeBusyInterval[] }> | undefined
): Map<string, BooktimeBusyInterval[]> {
  const busyMap = new Map<string, BooktimeBusyInterval[]>();
  for (const row of snapshotCourts ?? []) {
    if (row.courtId) {
      busyMap.set(row.courtId, row.busySlots ?? []);
    }
  }
  return busyMap;
}

export function buildPublicSlotsByExternalId(
  slotRows: Array<{ uuid?: string; availableSlots?: string[] }> | undefined | null
): Map<string, string[]> {
  const publicMap = new Map<string, string[]>();
  for (const row of slotRows ?? []) {
    if (typeof row.uuid === 'string' && row.uuid.trim()) {
      publicMap.set(row.uuid.trim(), row.availableSlots ?? []);
    }
  }
  return publicMap;
}

export function computeCourtAvailabilityRows(params: {
  club: Club;
  courts: Court[];
  raw: BooktimeAvailabilityRawData;
  durationMinutes: number;
  dateKey: string;
  courtFilter?: string | null;
}): BooktimeCourtAvailabilityRow[] {
  const { club, courts, raw, durationMinutes, dateKey, courtFilter } = params;
  const targetCourts = courtFilter
    ? courts.filter((court) => court.id === courtFilter)
    : courts;

  return targetCourts.map((court) => {
    const externalCourtId = court.externalCourtId!.trim();
    const ranges = raw.publicSlotsByExternalId.get(externalCourtId) ?? [];
    const busy = raw.busyByCourtId.get(court.id) ?? [];
    const freeSlots = filterPastSlots(
      computeFreeSlotsForCourt(ranges, busy, durationMinutes, club, dateKey),
      dateKey,
      club
    );
    return { court, externalCourtId, freeSlots };
  });
}

export function aggregateFreeSlotStarts(rows: BooktimeCourtAvailabilityRow[]): string[] {
  const freeStarts = new Set<string>();
  for (const row of rows) {
    for (const start of row.freeSlots) {
      freeStarts.add(start);
    }
  }
  return [...freeStarts].sort((a, b) => (parseSlotMinutes(a) ?? 0) - (parseSlotMinutes(b) ?? 0));
}

export function resolveBooktimeDateBounds(club: Club, bookableDays: number): {
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

export async function fetchBooktimeCourtAvailabilityForDate(params: {
  club: Club;
  companyId: string;
  date: Date;
  loadCompanyMeta?: boolean;
}): Promise<BooktimeCourtAvailabilityFetchResult> {
  const { club, companyId, date, loadCompanyMeta = false } = params;
  const dateKey = formatClubDateKey(date, club);
  const client = new BooktimeClient({ companyId });

  const companyPromise = loadCompanyMeta ? loadBooktimeCompany(client, companyId) : Promise.resolve(null);
  const [snapshotRes, slotsRes, company] = await Promise.all([
    booktimeApi.getSnapshot(club.id, dateKey),
    client.getAvailableSlots(date, dateKey),
    companyPromise,
  ]);

  const raw: BooktimeAvailabilityRawData = {
    busyByCourtId: buildBusyByCourtId(snapshotRes.data?.courts),
    publicSlotsByExternalId: buildPublicSlotsByExternalId(slotsRes),
  };

  let companyMeta: BooktimeAvailabilityCompanyMeta | undefined;
  if (loadCompanyMeta) {
    const durations = resolveBooktimeDurationsMinutes(company);
    const bookableDays =
      typeof company?.bookableDays === 'number' && company.bookableDays > 0
        ? company.bookableDays
        : DEFAULT_BOOKABLE_DAYS;
    companyMeta = { durations, bookableDays };
  }

  return { dateKey, raw, companyMeta };
}

export function pickDurationAfterMetaLoad(
  current: BooktimeBookingDuration,
  durations: BooktimeBookingDuration[]
): BooktimeBookingDuration {
  return pickClosestDurationOption(current, durations);
}
