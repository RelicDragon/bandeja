/**
 * Court reservations — per-slot view of a game's courts.
 *
 * A game needs N court slots. The organizer decides N, not the roster:
 *  - `Game.courtSlotCount` set (positive int) → N = max(courtSlotCount, assigned courts);
 *  - unset (legacy/default) → N = assigned courts when any, else the roster need
 *    (`computeBookingSelectionLimits(...).min`) — "8 players, one court" is one slot.
 * Each slot is either an assigned court (a
 * `GameCourt` row) or an implicit "any court" slot. A slot is:
 *  - `planned`  — nothing reserved,
 *  - `reported` — an organizer said "I reserved this with the club" (no link),
 *  - `linked`   — one or more provider bookings (`GameExternalBooking`) attached.
 *
 * Linked coverage is the union of the slot's links vs the game window; the
 * uncovered parts are gaps. Reported slots are assumed to cover the window.
 *
 * Pure and deterministic: the same input (in any array order) yields the same
 * output. No clock, no I/O; ISO instants in, ISO instants out.
 */
import type { GameBookingStatus } from './computeGameBookingStatus';
import { computeBookingSelectionLimits } from './computeBookingSelectionLimits';
import {
  computeCoverageGapsMs,
  coveredLengthMs,
  msToMinutes,
  parseInstantMs,
  toIsoInterval,
  toMsInterval,
  type IsoInterval,
  type MsInterval,
} from './coverageIntervals';

export type CourtSlotReservation = 'NONE' | 'REPORTED';

export type GameCourtSlotInput = {
  gameCourtId: string;
  courtId: string;
  order: number;
  reservation: CourtSlotReservation;
  reportedById?: string | null;
  reportedAt?: string | null;
};

export type ReservationLinkInput = {
  id: string;
  externalBookingId: string;
  provider: string;
  courtId?: string | null;
  gameCourtId?: string | null;
  bookingStart?: string | null;
  bookingEnd?: string | null;
  bookedByUserId?: string | null;
};

export type CourtReservationsGameInput = {
  startTime: string;
  endTime: string;
  maxParticipants: number;
  playersPerMatch?: number | null;
  /** `false` = the game has no real time yet; coverage is not evaluated. */
  timeIsSet?: boolean | null;
};

export type DeriveCourtReservationsInput = {
  game: CourtReservationsGameInput;
  gameCourts: readonly GameCourtSlotInput[];
  reportedAnyCourtCount?: number | null;
  links: readonly ReservationLinkInput[];
  /**
   * Organizer-chosen number of court slots (`Game.courtSlotCount`). A positive
   * integer wins over the roster; null/absent/invalid = legacy default
   * (see {@link computeRequiredCourtSlotCount}).
   */
  courtSlotCount?: number | null;
};

export type CourtSlotState = 'planned' | 'reported' | 'linked';

export type CourtSlotLink = ReservationLinkInput & {
  /** Epoch ms of `bookingStart`/`bookingEnd`; `null` when missing/invalid. */
  startMs: number | null;
  endMs: number | null;
};

export type CourtSlotView = {
  /** Stable id: `gc:<gameCourtId>` for assigned courts, `any:<n>` for implicit slots. */
  key: string;
  /** 0-based display position (assigned courts by `GameCourt.order`, then any-court slots). */
  order: number;
  courtId: string | null;
  gameCourtId: string | null;
  /** `courtId`, or for an any-court slot the court of its first link. */
  effectiveCourtId: string | null;
  state: CourtSlotState;
  /** Sorted by start (unknown times last), then id. */
  links: CourtSlotLink[];
  /** Provider of the first link, if linked. */
  provider: string | null;
  /** Uncovered parts of the game window. Only linked slots can have gaps. */
  gaps: IsoInterval[];
  /** A link on this slot has no usable times; the slot cannot prove coverage. */
  unknownTime: boolean;
  reportedById: string | null;
  reportedAt: string | null;
  coverage: { coveredMinutes: number; totalMinutes: number };
};

export type ReservationSummaryGap = IsoInterval & { slotKey: string };

export type ReservationSummary =
  | { kind: 'planned'; reserved: 0; total: number; gapCount: number }
  | { kind: 'partial'; reserved: number; total: number; gapCount: number }
  | { kind: 'reserved'; reserved: number; total: number; gapCount: 0 }
  | {
      kind: 'reserved_with_gap';
      reserved: number;
      total: number;
      gapCount: number;
      earliestGap: ReservationSummaryGap;
    };

export type ReservationSummaryKind = ReservationSummary['kind'];

export type LegacyBookingFields = {
  bookingStatus: GameBookingStatus;
  hasBookedCourt: boolean;
};

export type CourtReservationsResult = {
  slots: CourtSlotView[];
  summary: ReservationSummary;
  legacy: LegacyBookingFields;
  /** Links that found no slot (more link groups than free any-court slots). */
  unplacedLinks: CourtSlotLink[];
  /**
   * Courts held by a linked booking beyond what the game needs (roster need, or the organizer's
   * `courtSlotCount`): e.g. two courts booked for a 4-player game. Display only; the legacy
   * status is unchanged.
   */
  extraCourts: number;
};

/** Courts the roster needs (`computeBookingSelectionLimits(...).min`), at least 1. */
export function defaultCourtSlotCount(
  game: Pick<CourtReservationsGameInput, 'maxParticipants' | 'playersPerMatch'>,
): number {
  const playersPerMatch = game.playersPerMatch === 2 ? 2 : 4;
  const maxParticipants = Number.isFinite(game.maxParticipants) ? Math.max(0, game.maxParticipants) : 0;
  return Math.max(1, computeBookingSelectionLimits(maxParticipants, playersPerMatch).min);
}

/** A usable organizer-chosen slot count (positive integer), else null. */
export function normalizeCourtSlotCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Required slots N, at least 1:
 *  - explicit `courtSlotCount` → max(courtSlotCount, assigned courts);
 *  - else assigned courts when any (the organizer chose them), else the roster need.
 */
export function computeRequiredCourtSlotCount(
  game: Pick<CourtReservationsGameInput, 'maxParticipants' | 'playersPerMatch'>,
  assignedCourtCount: number,
  courtSlotCount?: number | null,
): number {
  const assigned = Number.isFinite(assignedCourtCount) ? Math.max(0, Math.floor(assignedCourtCount)) : 0;
  const explicit = normalizeCourtSlotCount(courtSlotCount);
  if (explicit != null) return Math.max(explicit, assigned);
  return assigned > 0 ? assigned : defaultCourtSlotCount(game);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toSlotLink(link: ReservationLinkInput): CourtSlotLink {
  const interval = toMsInterval({ start: link.bookingStart, end: link.bookingEnd });
  return {
    ...link,
    startMs: interval ? interval.start : null,
    endMs: interval ? interval.end : null,
  };
}

/** Start ascending, unknown times last, then end, then id. */
export function compareSlotLinks(a: CourtSlotLink, b: CourtSlotLink): number {
  if (a.startMs == null && b.startMs != null) return 1;
  if (a.startMs != null && b.startMs == null) return -1;
  if (a.startMs != null && b.startMs != null && a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs != null && b.endMs != null && a.endMs !== b.endMs) return a.endMs - b.endMs;
  return compareStrings(a.id, b.id);
}

function linkInterval(link: CourtSlotLink): MsInterval | null {
  return link.startMs != null && link.endMs != null ? { start: link.startMs, end: link.endMs } : null;
}

type SlotDraft = {
  key: string;
  courtId: string | null;
  gameCourtId: string | null;
  reported: boolean;
  reportedById: string | null;
  reportedAt: string | null;
  links: CourtSlotLink[];
};

/**
 * Groups links that matched no assigned court: same `courtId` → one group
 * (back-to-back bookings on one court are one slot); a link without a court is
 * its own group. Groups are ordered by earliest link, then key.
 */
function groupUnmatchedLinks(links: CourtSlotLink[]): CourtSlotLink[][] {
  const byCourt = new Map<string, CourtSlotLink[]>();
  const groups: CourtSlotLink[][] = [];
  for (const link of [...links].sort(compareSlotLinks)) {
    if (link.courtId) {
      const existing = byCourt.get(link.courtId);
      if (existing) {
        existing.push(link);
        continue;
      }
      const group = [link];
      byCourt.set(link.courtId, group);
      groups.push(group);
    } else {
      groups.push([link]);
    }
  }
  // Already in first-link order because links were sorted before grouping.
  return groups;
}

export function deriveCourtReservations(input: DeriveCourtReservationsInput): CourtReservationsResult {
  const { game } = input;
  const gameCourts = [...input.gameCourts].sort(
    (a, b) => a.order - b.order || compareStrings(a.gameCourtId, b.gameCourtId),
  );
  const total = computeRequiredCourtSlotCount(game, gameCourts.length, input.courtSlotCount);

  const assigned: SlotDraft[] = gameCourts.map((gc) => ({
    key: `gc:${gc.gameCourtId}`,
    courtId: gc.courtId,
    gameCourtId: gc.gameCourtId,
    reported: gc.reservation === 'REPORTED',
    reportedById: gc.reportedById ?? null,
    reportedAt: gc.reportedAt ?? null,
    links: [],
  }));
  const byGameCourtId = new Map(assigned.map((s) => [s.gameCourtId as string, s]));
  const byCourtId = new Map<string, SlotDraft>();
  for (const slot of assigned) {
    if (slot.courtId && !byCourtId.has(slot.courtId)) byCourtId.set(slot.courtId, slot);
  }

  const unmatched: CourtSlotLink[] = [];
  for (const raw of input.links) {
    const link = toSlotLink(raw);
    const target =
      (link.gameCourtId ? byGameCourtId.get(link.gameCourtId) : undefined) ??
      (link.courtId ? byCourtId.get(link.courtId) : undefined);
    if (target) target.links.push(link);
    else unmatched.push(link);
  }

  const anyCount = Math.max(0, total - assigned.length);
  const groups = groupUnmatchedLinks(unmatched);
  const placedGroups = groups.slice(0, anyCount);
  const unplacedLinks = groups.slice(anyCount).flat().sort(compareSlotLinks);
  const reportedRequested = Math.max(0, Math.floor(Number(input.reportedAnyCourtCount) || 0));
  const reportedAny = Math.min(reportedRequested, anyCount - placedGroups.length);

  const anySlots: SlotDraft[] = [];
  for (let i = 0; i < anyCount; i += 1) {
    const group = placedGroups[i];
    anySlots.push({
      key: `any:${i}`,
      courtId: null,
      gameCourtId: null,
      reported: !group && i - placedGroups.length < reportedAny,
      reportedById: null,
      reportedAt: null,
      links: group ? [...group] : [],
    });
  }

  const evaluateCoverage = game.timeIsSet !== false;
  const windowMs = toMsInterval({ start: game.startTime, end: game.endTime });
  const totalMinutes = evaluateCoverage && windowMs ? msToMinutes(windowMs.end - windowMs.start) : 0;

  const slots: CourtSlotView[] = [...assigned, ...anySlots].map((draft, index) => {
    const links = [...draft.links].sort(compareSlotLinks);
    const state: CourtSlotState = links.length > 0 ? 'linked' : draft.reported ? 'reported' : 'planned';
    const unknownTime = state === 'linked' && links.some((l) => linkInterval(l) == null);
    let gaps: IsoInterval[] = [];
    let coveredMinutes = 0;
    if (state === 'reported') {
      coveredMinutes = totalMinutes;
    } else if (state === 'linked' && evaluateCoverage && windowMs) {
      const intervals = links.map(linkInterval).filter((i): i is MsInterval => i != null);
      gaps = computeCoverageGapsMs(windowMs, intervals).map(toIsoInterval);
      coveredMinutes = msToMinutes(coveredLengthMs(windowMs, intervals));
    } else if (state === 'linked') {
      coveredMinutes = totalMinutes;
    }
    const firstLinkCourt = links.find((l) => l.courtId)?.courtId ?? null;
    return {
      key: draft.key,
      order: index,
      courtId: draft.courtId,
      gameCourtId: draft.gameCourtId,
      effectiveCourtId: draft.courtId ?? firstLinkCourt,
      state,
      links,
      provider: links.length > 0 ? links[0].provider : null,
      gaps,
      unknownTime,
      reportedById: draft.reportedById,
      reportedAt: draft.reportedAt,
      coverage: { coveredMinutes, totalMinutes },
    };
  });

  const summary = summarizeCourtSlots(slots);
  const anyLink = input.links.length > 0;
  const anyReported = slots.some((s) => s.state === 'reported');
  const bookingStatus: GameBookingStatus = anyLink
    ? summary.kind === 'reserved'
      ? 'EXTERNAL_FULL'
      : 'EXTERNAL_PARTIAL'
    : anyReported
      ? 'MANUAL'
      : 'NONE';

  const needed = Math.max(defaultCourtSlotCount(game), normalizeCourtSlotCount(input.courtSlotCount) ?? 0);
  const linkedCourts = slots.filter((s) => s.state === 'linked').length;

  return {
    slots,
    summary,
    legacy: { bookingStatus, hasBookedCourt: summary.reserved > 0 },
    unplacedLinks,
    extraCourts: Math.max(0, linkedCourts - needed),
  };
}

export function isSlotReserved(slot: Pick<CourtSlotView, 'state'>): boolean {
  return slot.state !== 'planned';
}

export function summarizeCourtSlots(
  slots: readonly Pick<CourtSlotView, 'key' | 'order' | 'state' | 'gaps'>[],
): ReservationSummary {
  const total = slots.length;
  const reserved = slots.filter(isSlotReserved).length;
  let gapCount = 0;
  let earliestGap: ReservationSummaryGap | null = null;
  let earliestMs = Number.POSITIVE_INFINITY;
  for (const slot of [...slots].sort((a, b) => a.order - b.order)) {
    for (const gap of slot.gaps) {
      gapCount += 1;
      const startMs = parseInstantMs(gap.start) ?? Number.POSITIVE_INFINITY;
      if (earliestGap == null || startMs < earliestMs) {
        earliestGap = { ...gap, slotKey: slot.key };
        earliestMs = startMs;
      }
    }
  }
  if (reserved === 0) return { kind: 'planned', reserved: 0, total, gapCount };
  if (reserved < total) return { kind: 'partial', reserved, total, gapCount };
  if (earliestGap) return { kind: 'reserved_with_gap', reserved, total, gapCount, earliestGap };
  return { kind: 'reserved', reserved, total, gapCount: 0 };
}
