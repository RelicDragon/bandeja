/** Pill tone for a summary or a slot (see `ReservationPill`). */
import type { CourtSlotView, ReservationSummary } from '@shared/gameBooking/courtReservations';
import { isReservedByReportOnly } from '@shared/gameBooking/reservationCopy';

/**
 * `gameOnly`: neutral — the organizer handles the court; nothing to reserve or worry about.
 * `reported`: the organizer marked it reserved; no club booking proves it (not green).
 */
/** `noTime`: the game has no time yet, so nothing can be booked (neutral). */
export type ReservationPillTone = 'planned' | 'partial' | 'reserved' | 'reported' | 'gap' | 'unknown' | 'gameOnly' | 'noTime';

/** Pass `slots` so a game reserved only by the organizer's word is not shown as booked. */
export function pillToneForSummary(
  summary: ReservationSummary,
  slots?: readonly Pick<CourtSlotView, 'state'>[],
): ReservationPillTone {
  if (summary.kind === 'reserved' && slots && isReservedByReportOnly(slots)) return 'reported';
  switch (summary.kind) {
    case 'planned':
      return 'planned';
    case 'partial':
      return 'partial';
    case 'reserved':
      return 'reserved';
    case 'reserved_with_gap':
      return 'gap';
  }
}

export function pillToneForSlot(slot: Pick<CourtSlotView, 'state' | 'gaps' | 'unknownTime'>): ReservationPillTone {
  if (slot.state === 'planned') return 'planned';
  if (slot.state === 'reported') return 'reported';
  if (slot.state === 'linked' && slot.unknownTime) return 'unknown';
  if (slot.state === 'linked' && slot.gaps.length > 0) return 'gap';
  return 'reserved';
}
