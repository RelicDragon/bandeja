/**
 * Court slots → legacy `Game.bookingStatus` / `Game.hasBookedCourt`.
 *
 * Thin adapter over the shared core `deriveCourtReservations`
 * (`@bandeja/shared/gameBooking/courtReservations`): maps DB rows to its input
 * so the backend and every client derive reservations the same way
 * (docs/domains/booking.md "Court slots").
 *
 * Semantics are the shared core's, with one backend guard on top:
 * - A slot is *reserved* when it is REPORTED or has at least one linked booking.
 * - Required slots N (organizer decides, not the roster): `Game.courtSlotCount` set →
 *   max(courtSlotCount, assigned courts); unset → assigned courts when any, else the roster
 *   need, at least 1. "8 players, 1 court selected" needs 1 — same as the previous backend rule.
 * - Links that match no assigned court fill implicit "any court" slots (same court →
 *   one slot); links beyond N stay unplaced and reserve nothing.
 * - `reportedAnyCourtCount` only fills implicit slots (N − assigned courts).
 * - Any link → EXTERNAL_FULL iff every slot is reserved and no linked slot has a gap
 *   (unknown booking times are a gap); else EXTERNAL_PARTIAL. No link → MANUAL iff a
 *   slot is reported, else NONE. `timeIsSet = false` skips coverage.
 * - Backend guard: `hasBookedCourt` stays true while any link exists (old apps refuse
 *   to clear "court booked" while bookings are linked), even when the link is unplaced.
 */
import {
  deriveCourtReservations,
  computeRequiredCourtSlotCount,
  type DeriveCourtReservationsInput,
} from '@bandeja/shared/gameBooking/courtReservations';
import { computeCoverageGaps } from '@bandeja/shared/gameBooking/coverageIntervals';

export type LegacyBookingStatus = 'NONE' | 'MANUAL' | 'EXTERNAL_PARTIAL' | 'EXTERNAL_FULL';

export type CourtSlotInput = {
  id: string;
  courtId: string;
  reservation: 'NONE' | 'REPORTED';
  /** `GameCourt.order`; defaults to the array position. */
  order?: number;
};

export type CourtSlotLinkInput = {
  id?: string;
  externalBookingId?: string;
  externalBookingProvider?: string | null;
  gameCourtId?: string | null;
  courtId?: string | null;
  bookingStart?: Date | string | null;
  bookingEnd?: Date | string | null;
};

export type ComputeLegacyBookingFieldsInput = {
  slots: CourtSlotInput[];
  links: CourtSlotLinkInput[];
  reportedAnyCourtCount: number;
  /** `Game.courtSlotCount`; null/absent = default rule. */
  courtSlotCount?: number | null;
  startTime: Date | string;
  endTime: Date | string;
  maxParticipants: number;
  playersPerMatch: number;
  timeIsSet?: boolean;
};

export type ComputeLegacyBookingFieldsResult = {
  bookingStatus: LegacyBookingStatus;
  hasBookedCourt: boolean;
  requiredSlotCount: number;
  reservedSlotCount: number;
  linkedCoverageMet: boolean;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  return value;
}

/** True when the union of `intervals` (epoch ms) covers [start, end] with no gap. */
export function intervalsCoverWindow(
  intervals: Array<{ start: number | null; end: number | null }>,
  start: number,
  end: number,
): boolean {
  const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
  if (!(end > start)) return false;
  return (
    computeCoverageGaps(
      { start: iso(start), end: iso(end) },
      intervals.map((i) => ({ start: iso(i.start), end: iso(i.end) })),
    ).length === 0
  );
}

export function computeRequiredSlotCount(
  maxParticipants: number,
  playersPerMatch: number,
  slotCount: number,
  courtSlotCount?: number | null,
): number {
  return computeRequiredCourtSlotCount({ maxParticipants, playersPerMatch }, slotCount, courtSlotCount);
}

export function toDeriveCourtReservationsInput(input: ComputeLegacyBookingFieldsInput): DeriveCourtReservationsInput {
  return {
    game: {
      startTime: toIso(input.startTime) ?? '',
      endTime: toIso(input.endTime) ?? '',
      maxParticipants: input.maxParticipants,
      playersPerMatch: input.playersPerMatch,
      timeIsSet: input.timeIsSet ?? true,
    },
    gameCourts: input.slots.map((slot, index) => ({
      gameCourtId: slot.id,
      courtId: slot.courtId,
      order: slot.order ?? index,
      reservation: slot.reservation,
    })),
    reportedAnyCourtCount: input.reportedAnyCourtCount,
    courtSlotCount: input.courtSlotCount ?? null,
    links: input.links.map((link, index) => ({
      id: link.id ?? `link-${index}`,
      externalBookingId: link.externalBookingId ?? link.id ?? `link-${index}`,
      provider: link.externalBookingProvider ?? '',
      courtId: link.courtId ?? null,
      gameCourtId: link.gameCourtId ?? null,
      bookingStart: toIso(link.bookingStart),
      bookingEnd: toIso(link.bookingEnd),
    })),
  };
}

export function computeLegacyBookingFieldsFromSlots(
  input: ComputeLegacyBookingFieldsInput,
): ComputeLegacyBookingFieldsResult {
  const derived = deriveCourtReservations(toDeriveCourtReservationsInput(input));
  const linkedSlots = derived.slots.filter((slot) => slot.state === 'linked');
  return {
    bookingStatus: derived.legacy.bookingStatus,
    hasBookedCourt: derived.legacy.hasBookedCourt || input.links.length > 0,
    requiredSlotCount: derived.summary.total,
    reservedSlotCount: derived.summary.reserved,
    linkedCoverageMet: linkedSlots.length > 0 && linkedSlots.every((slot) => slot.gaps.length === 0 && !slot.unknownTime),
  };
}
