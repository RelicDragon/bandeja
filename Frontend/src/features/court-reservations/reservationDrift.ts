/** Linked reservations whose club-side copy moved or disappeared (upstream check). */
import type { LinkedBookingPayload } from './courtReservationsInput';

export type ReservationDrift = {
  linkId: string;
  externalBookingId: string;
  provider: string;
  courtId: string | null;
  state: 'MOVED' | 'MISSING';
  upstreamStart: string | null;
  upstreamEnd: string | null;
};

export type DriftActionKind = 'move_game' | 'keep_game' | 'reserve_again' | 'unlink';

/** Links whose upstream copy moved or is gone, missing first. */
export function collectReservationDrifts(links: readonly LinkedBookingPayload[]): ReservationDrift[] {
  const out: ReservationDrift[] = [];
  for (const l of links) {
    if (l.upstreamState !== 'MOVED' && l.upstreamState !== 'MISSING') continue;
    out.push({
      linkId: l.id,
      externalBookingId: l.externalBookingId,
      provider: l.externalBookingProvider,
      courtId: l.courtId ?? null,
      state: l.upstreamState,
      upstreamStart: l.upstreamStart ?? null,
      upstreamEnd: l.upstreamEnd ?? null,
    });
  }
  return out.sort((a, b) => (a.state === b.state ? a.linkId.localeCompare(b.linkId) : a.state === 'MISSING' ? -1 : 1));
}
