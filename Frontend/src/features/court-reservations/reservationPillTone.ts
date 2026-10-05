/** Pill tone for a summary or a slot (see `ReservationPill`). */
import type { CourtSlotView, ReservationSummary } from '@shared/gameBooking/courtReservations';

export type ReservationPillTone = 'planned' | 'partial' | 'reserved' | 'gap' | 'unknown';

export function pillToneForSummary(summary: ReservationSummary): ReservationPillTone {
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
  if (slot.state === 'linked' && slot.unknownTime) return 'unknown';
  if (slot.state === 'linked' && slot.gaps.length > 0) return 'gap';
  return 'reserved';
}
