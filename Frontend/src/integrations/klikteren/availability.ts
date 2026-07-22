import { klikterenApi } from '@/api/klikteren';
import type { Club, Court } from '@/types';
import { KlikterenClient } from '@/integrations/klikteren/client';
import { computeFreeSlotsForCourt } from '@/integrations/booktime/slots';
import {
  availableSlotsToRangeStrings,
  formatClubDateKey,
  freeStartTimesToDurationSlots,
  type KlikterenBookingDuration,
  type KlikterenBusyInterval,
} from '@/integrations/klikteren/slots';
import { clubLocalDateString, clubLocalNowMinutes } from '@/utils/clubAdmin/scheduleTime';
import { getKlikterenVenueId, isKlikterenClub } from '@shared/clubIntegration';
import {
  KLIKTEREN_BOOKING_DURATIONS,
  KLIKTEREN_SLOT_STEP_MINUTES,
} from '@/integrations/klikteren/config';

export type KlikterenCourtAvailabilityRow = {
  court: Court;
  externalCourtId: string;
  freeSlots: string[];
};

export type KlikterenAvailabilityRawData = {
  busyByCourtId: Map<string, KlikterenBusyInterval[]>;
  publicSlotsByExternalId: Map<string, string[]>;
};

export type KlikterenAvailabilityClubMeta = {
  durations: KlikterenBookingDuration[];
  bookableDays: number;
};

export type KlikterenCourtAvailabilityFetchResult = {
  dateKey: string;
  raw: KlikterenAvailabilityRawData;
  companyMeta?: KlikterenAvailabilityClubMeta;
};

const DEFAULT_BOOKABLE_DAYS = 7;

export function mappedKlikterenCourts(club: Club, courts?: Court[]): Court[] {
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
  snapshotCourts: Array<{ courtId?: string | null; busySlots?: KlikterenBusyInterval[] }> | undefined,
): Map<string, KlikterenBusyInterval[]> {
  const busyMap = new Map<string, KlikterenBusyInterval[]>();
  for (const row of snapshotCourts ?? []) {
    if (row.courtId) {
      busyMap.set(row.courtId, row.busySlots ?? []);
    }
  }
  return busyMap;
}

export function buildPublicSlotsByExternalId(
  availability: {
    courtFreeSlots?: Record<string, string[]>;
    courtDateClosedByOwner?: Record<string, boolean>;
    courtSlotConfig?: Record<string, { slotLengthMinutes?: number; minSlotsPerBooking?: number }>;
  } | null | undefined,
  durationMinutes: number,
): Map<string, string[]> {
  const publicMap = new Map<string, string[]>();
  for (const [courtId, freeStarts] of Object.entries(availability?.courtFreeSlots ?? {})) {
    if (availability?.courtDateClosedByOwner?.[courtId]) {
      publicMap.set(courtId, []);
      continue;
    }
    const slotStep =
      availability?.courtSlotConfig?.[courtId]?.slotLengthMinutes ??
      KLIKTEREN_SLOT_STEP_MINUTES;
    const slots = freeStartTimesToDurationSlots(freeStarts ?? [], durationMinutes, slotStep);
    publicMap.set(courtId, availableSlotsToRangeStrings(slots));
  }
  return publicMap;
}

export function computeCourtAvailabilityRows(params: {
  club: Club;
  courts: Court[];
  raw: KlikterenAvailabilityRawData;
  durationMinutes: number;
  dateKey: string;
  courtFilter?: string | null;
}): KlikterenCourtAvailabilityRow[] {
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

export function resolveKlikterenDateBounds(club: Club, bookableDays: number): {
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

export async function fetchKlikterenCourtAvailabilityForDate(params: {
  club: Club;
  klikterenVenueId: string;
  date: Date;
  durationMinutes: number;
  loadClubMeta?: boolean;
}): Promise<KlikterenCourtAvailabilityFetchResult> {
  const { club, klikterenVenueId, date, durationMinutes, loadClubMeta = false } = params;
  const dateKey = formatClubDateKey(date, club);
  const client = new KlikterenClient({ klikterenVenueId });

  const venuePromise = loadClubMeta ? client.getVenue(klikterenVenueId) : Promise.resolve(null);
  const [snapshotRes, availabilityRes, venue] = await Promise.all([
    klikterenApi.getSnapshot(club.id, dateKey),
    client.getAvailability(klikterenVenueId, dateKey),
    venuePromise,
  ]);

  const raw: KlikterenAvailabilityRawData = {
    busyByCourtId: buildBusyByCourtId(snapshotRes.data?.courts),
    publicSlotsByExternalId: buildPublicSlotsByExternalId(availabilityRes, durationMinutes),
  };

  let companyMeta: KlikterenAvailabilityClubMeta | undefined;
  if (loadClubMeta) {
    const autoOpenDays = (venue?.courts ?? [])
      .map((court) => court.autoOpenDays)
      .filter((days): days is number => typeof days === 'number' && days > 0);
    companyMeta = {
      durations: [...KLIKTEREN_BOOKING_DURATIONS],
      bookableDays: autoOpenDays.length > 0 ? Math.max(...autoOpenDays) : DEFAULT_BOOKABLE_DAYS,
    };
  }

  return { dateKey, raw, companyMeta };
}

export function isKlikterenClubWithConfig(club: Club | undefined): club is Club {
  return isKlikterenClub(club) && getKlikterenVenueId(club) != null;
}
