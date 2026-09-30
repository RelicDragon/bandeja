/**
 * Slot engine (booking plan §14.1, §14.3, §14.9; slice 7b). Given one club, a date, an
 * optional time window, a duration and a court count, it returns candidate slots where N
 * specific courts are available at the same start, each tagged with a confidence:
 *
 *   live      Nspadel (free ranges) / Weltner (exact {start,duration} tuples), fetched now
 *             through the 60 s cache. Weltner availability is never inverted into busy ranges.
 *   snapshot  Booktime / Padeloo / Klikteren: `CourtOccupancyService` (FE-written external
 *             snapshots + app games + holds). No known conflict ≠ free.
 *   app_only  No integration: app games and holds only.
 *
 * Hard blocks (club/provider bookings, holds, app games **with** a booked court) remove a
 * court; soft blocks (app games without a booked court, `isOccupancySoftBlock`) keep it and
 * are counted in `softConflicts`. Everything is computed in the **club's** city timezone.
 *
 * Pure except for the injected `SlotEngineSources`, so tests mock every provider.
 */
import type { AgentSlotConfidence } from '@bandeja/shared/agentContract';
import { isOccupancyHardBlock, isOccupancySoftBlock, type OccupancyBlock } from '../../../game/courtOccupancy.service';
import {
  MINUTES_PER_DAY,
  addDays,
  businessMinuteToLocal,
  isCalendarDate,
  localMidnight,
  parseClock,
  resolveBusinessHours,
  resolveTimeWindow,
  slotInstants,
  todayInZone,
} from './clubTime';
import { ProviderRateLimitedError } from './liveProviderCache';
import {
  SLOT_STEP_MINUTES,
  allowedDurations,
  isDurationAllowed,
  slotSourceKind,
  sourceConfidence,
  type SlotProvider,
} from './providerRules';

export type SlotEngineCourt = { id: string; name: string; externalCourtId: string | null };

export type SlotEngineClub = {
  id: string;
  name: string;
  timeZone: string;
  openingTime: string | null;
  closingTime: string | null;
  provider: SlotProvider;
  /** Active courts (already filtered by sport), sorted by name. */
  courts: SlotEngineCourt[];
};

export type SlotEngineRequest = {
  date: string;
  timeFrom?: string;
  timeTo?: string;
  durationMinutes: number;
  courts: number;
  now: Date;
};

/** Free wall-clock ranges (`HH:mm`) per upstream court id, from `getNspadelAvailability`. */
export type NspadelFreeRanges = Array<{ externalCourtId: string; startTime: string; endTime: string }>;
/** Exact Weltner tuples per **app** court id, from `getWeltnerAvailability`. */
export type WeltnerTuples = Array<{ courtId: string; slots: Array<{ start: string; end: string; duration: number }> }>;

export type SlotEngineSources = {
  nspadelFreeRanges: (clubId: string, date: string, durationMinutes: number) => Promise<{ value: NspadelFreeRanges; fetchedAt: Date }>;
  weltnerTuples: (clubId: string, date: string) => Promise<{ value: WeltnerTuples; fetchedAt: Date }>;
  occupancy: (input: { clubId: string; rangeStart: Date; rangeEnd: Date; externals: boolean }) => Promise<OccupancyBlock[]>;
  /** Latest FE snapshot `fetchedAt` for the club/date; null when nobody has viewed that date. */
  snapshotFetchedAt: (clubId: string, provider: SlotProvider, date: string) => Promise<Date | null>;
};

export type CandidateSlot = {
  clubId: string;
  courtIds: string[];
  courtNames: string[];
  start: Date;
  end: Date;
  timeZone: string;
  confidence: AgentSlotConfidence;
  /** When availability was observed: provider fetch time (live) or snapshot `fetchedAt`; null for app_only. */
  asOf: Date | null;
  provider: SlotProvider;
  /** Local wall clock of the start in the club timezone. */
  localDate: string;
  localTime: string;
  /** App games without a booked court overlapping the chosen courts (or unassigned). */
  softConflicts: number;
  /** Starts inside the requested `timeFrom`/`timeTo` window (always true without a window). */
  inWindow: boolean;
  /** Minutes between the start and the window (0 inside it); used to suggest nearby times. */
  windowDistance: number;
};

export type ClubSlotsStatus =
  | 'ok'
  | 'duration_not_supported'
  | 'date_out_of_range'
  | 'no_courts'
  | 'provider_unavailable'
  | 'provider_rate_limited';

export type ClubSlotsResult = {
  clubId: string;
  provider: SlotProvider;
  confidence: AgentSlotConfidence;
  asOf: Date | null;
  status: ClubSlotsStatus;
  allowedDurations: number[] | null;
  /** False when the club has no opening hours and the 07:00–23:00 default was used. */
  hoursKnown: boolean;
  /** Snapshot provider but no snapshot exists for the date: only app games/holds were checked. */
  snapshotMissing: boolean;
  /** All candidates of the business day (window flag set per slot), chronological. */
  slots: CandidateSlot[];
};

const MAX_DAYS_AHEAD = 60;
const WELTNER_MAX_DAYS_AHEAD = 30;

type Candidate = { startMinute: number; start: Date; end: Date };
type CourtFree = (court: SlotEngineCourt, candidate: Candidate) => boolean;

function overlaps(block: OccupancyBlock, start: Date, end: Date): boolean {
  const blockStart = new Date(block.startTime).getTime();
  const blockEnd = new Date(block.endTime).getTime();
  return Number.isFinite(blockStart) && Number.isFinite(blockEnd) && blockStart < end.getTime() && blockEnd > start.getTime();
}

/** booking.md: club bookings and holds are hard; an app game that holds a booked court is too. */
export function isSlotHardBlock(block: OccupancyBlock): boolean {
  return isOccupancyHardBlock(block) || (block.kind === 'game' && block.hasBookedCourt && block.courtId != null);
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

function gridCandidates(
  request: SlotEngineRequest,
  timeZone: string,
  open: number,
  close: number,
): Candidate[] {
  const out: Candidate[] = [];
  for (let minute = open; minute + request.durationMinutes <= close; minute += SLOT_STEP_MINUTES) {
    const instants = slotInstants(request.date, minute, request.durationMinutes, timeZone);
    if (instants) out.push({ startMinute: minute, ...instants });
  }
  return out;
}

/**
 * Candidate slots for one club. Never throws for provider trouble: the club comes back with
 * `provider_unavailable` / `provider_rate_limited` and no slots.
 */
export async function computeClubSlots(
  club: SlotEngineClub,
  request: SlotEngineRequest,
  sources: SlotEngineSources,
): Promise<ClubSlotsResult> {
  const kind = slotSourceKind(club.provider);
  const hours = resolveBusinessHours(club.openingTime, club.closingTime);
  const base: ClubSlotsResult = {
    clubId: club.id,
    provider: club.provider,
    confidence: sourceConfidence(kind),
    asOf: null,
    status: 'ok',
    allowedDurations: allowedDurations(club.provider),
    hoursKnown: hours.known,
    snapshotMissing: false,
    slots: [],
  };

  if (!isDurationAllowed(club.provider, request.durationMinutes)) return { ...base, status: 'duration_not_supported' };
  const today = todayInZone(request.now, club.timeZone);
  const ahead = isCalendarDate(request.date) ? daysBetween(today, request.date) : -1;
  const maxAhead = kind === 'weltner_live' ? WELTNER_MAX_DAYS_AHEAD : MAX_DAYS_AHEAD;
  if (ahead < 0 || ahead > maxAhead) return { ...base, status: 'date_out_of_range' };

  // Live providers need a mapped court; snapshot/app-only clubs can use every active court.
  const courts = kind === 'app_only' || kind === 'snapshot' ? club.courts : club.courts.filter((court) => court.externalCourtId);
  if (courts.length < request.courts) return { ...base, status: 'no_courts' };

  const rangeStart = localMidnight(request.date, club.timeZone);
  const rangeEnd = localMidnight(addDays(request.date, 2), club.timeZone);

  let candidates: Candidate[];
  let providerFree: CourtFree = () => true;
  let asOf: Date | null = null;
  let snapshotMissing = false;
  let confidence = base.confidence;

  try {
    if (kind === 'nspadel_live') {
      const { value, fetchedAt } = await sources.nspadelFreeRanges(club.id, request.date, request.durationMinutes);
      asOf = fetchedAt;
      const byCourt = new Map<string, Array<{ start: number; end: number }>>();
      for (const range of value) {
        const start = parseClock(range.startTime);
        const end = parseClock(range.endTime);
        if (start == null || end == null || end <= start) continue;
        const list = byCourt.get(range.externalCourtId) ?? [];
        list.push({ start, end });
        byCourt.set(range.externalCourtId, list);
      }
      candidates = gridCandidates(request, club.timeZone, hours.known ? hours.open : 0, hours.known ? hours.close : MINUTES_PER_DAY);
      providerFree = (court, candidate) =>
        (byCourt.get(court.externalCourtId ?? '') ?? []).some(
          (range) => range.start <= candidate.startMinute && candidate.startMinute + request.durationMinutes <= range.end,
        );
    } else if (kind === 'weltner_live') {
      const { value, fetchedAt } = await sources.weltnerTuples(club.id, request.date);
      asOf = fetchedAt;
      // Exact tuples only: a court is available at a start iff Weltner lists that
      // {start, duration}. Starts come from the tuples, not from a grid.
      const tuplesByCourt = new Map<string, Set<number>>();
      const starts = new Set<number>();
      for (const court of value) {
        const set = new Set<number>();
        for (const slot of court.slots) {
          if (slot.duration !== request.durationMinutes) continue;
          const start = parseClock(slot.start);
          if (start == null) continue;
          set.add(start);
          starts.add(start);
        }
        tuplesByCourt.set(court.courtId, set);
      }
      const open = hours.known ? hours.open : 0;
      const close = hours.known ? hours.close : MINUTES_PER_DAY + request.durationMinutes;
      candidates = [...starts]
        .sort((a, b) => a - b)
        .filter((minute) => minute >= open && minute + request.durationMinutes <= close)
        .map((minute) => {
          const instants = slotInstants(request.date, minute, request.durationMinutes, club.timeZone);
          return instants ? { startMinute: minute, ...instants } : null;
        })
        .filter((candidate): candidate is Candidate => candidate != null);
      providerFree = (court, candidate) => tuplesByCourt.get(court.id)?.has(candidate.startMinute) ?? false;
    } else {
      candidates = gridCandidates(request, club.timeZone, hours.open, hours.close);
      if (kind === 'snapshot') {
        asOf = await sources.snapshotFetchedAt(club.id, club.provider, request.date);
        if (!asOf) {
          // Nobody viewed this date: there is no external evidence at all.
          snapshotMissing = true;
          confidence = 'app_only';
        }
      }
    }
  } catch (error) {
    if (error instanceof ProviderRateLimitedError) return { ...base, status: 'provider_rate_limited' };
    console.warn(`[agent-slots] ${club.provider} availability failed for club ${club.id}:`, error instanceof Error ? error.message : error);
    return { ...base, status: 'provider_unavailable' };
  }

  const blocks = await sources.occupancy({ clubId: club.id, rangeStart, rangeEnd, externals: kind === 'snapshot' });
  const hardBlocks = blocks.filter(isSlotHardBlock);
  const softBlocks = blocks.filter(isOccupancySoftBlock);
  const window = resolveTimeWindow(hours, request.timeFrom, request.timeTo);

  const slots: CandidateSlot[] = [];
  for (const candidate of candidates) {
    if (candidate.start.getTime() <= request.now.getTime()) continue;
    const free = courts.filter(
      (court) =>
        providerFree(court, candidate) &&
        !hardBlocks.some((block) => block.courtId === court.id && overlaps(block, candidate.start, candidate.end)),
    );
    if (free.length < request.courts) continue;
    // Prefer courts without soft conflicts, then by name (courts arrive name-sorted).
    const softFor = (courtId: string) =>
      softBlocks.filter((block) => block.courtId === courtId && overlaps(block, candidate.start, candidate.end)).length;
    const chosen = [...free]
      .map((court, index) => ({ court, index, soft: softFor(court.id) }))
      .sort((a, b) => a.soft - b.soft || a.index - b.index)
      .slice(0, request.courts);
    const unassignedSoft = softBlocks.filter((block) => block.courtId == null && overlaps(block, candidate.start, candidate.end)).length;
    const local = businessMinuteToLocal(request.date, candidate.startMinute);
    const distance = !window
      ? 0
      : candidate.startMinute < window.from
        ? window.from - candidate.startMinute
        : Math.max(0, candidate.startMinute - window.to);
    slots.push({
      clubId: club.id,
      courtIds: chosen.map((row) => row.court.id),
      courtNames: chosen.map((row) => row.court.name),
      start: candidate.start,
      end: candidate.end,
      timeZone: club.timeZone,
      confidence,
      asOf: confidence === 'app_only' ? null : asOf,
      provider: club.provider,
      localDate: local.date,
      localTime: local.time,
      softConflicts: chosen.reduce((sum, row) => sum + row.soft, 0) + unassignedSoft,
      inWindow: distance === 0,
      windowDistance: distance,
    });
  }

  return { ...base, confidence, asOf: confidence === 'app_only' ? null : asOf, snapshotMissing, slots };
}
