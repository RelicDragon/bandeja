/**
 * "Is that your booking?" — the club only tells us a court is busy, not whose
 * booking it is. An organizer who booked by phone sees their own court as
 * taken. Claiming it marks the court as reserved (`REPORTED`), which the
 * server's clash guard trusts (docs/domains/booking.md "Clash guard").
 */
import type { BookedCourtSlot, Game } from '@/types';
import { isClaimableClubBooking } from '@/hooks/useCourtOccupancy';
import { buildCourtReservationsInput } from '@/utils/courtReservationView';

export type ClubBookingConflict = {
  courtId: string;
  /** The club's busy range on that court (merged), ISO. */
  start: string;
  end: string;
};

/**
 * Per court in `courtIds`: the club bookings (not admin holds) that overlap
 * `[startMs, endMs)`, merged into one range that also spans adjacent bookings.
 */
export function findClubBookingConflicts(
  bookings: readonly BookedCourtSlot[],
  courtIds: readonly string[],
  window: { startMs: number; endMs: number },
): ClubBookingConflict[] {
  if (!(window.endMs > window.startMs)) return [];
  const out: ClubBookingConflict[] = [];
  for (const courtId of courtIds) {
    const ranges = bookings
      .filter((b) => b.courtId === courtId && isClaimableClubBooking(b))
      .map((b) => ({ start: Date.parse(b.startTime), end: Date.parse(b.endTime) }))
      .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
      .sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
      else merged.push({ ...r });
    }
    const hits = merged.filter((r) => r.start < window.endMs && r.end > window.startMs);
    if (hits.length === 0) continue;
    out.push({
      courtId,
      start: new Date(hits[0].start).toISOString(),
      end: new Date(hits[hits.length - 1].end).toISOString(),
    });
  }
  return out;
}

/** Courts whose slot is already marked as reserved (`REPORTED`). */
export function reportedCourtIdsOf(game: Game): string[] {
  return buildCourtReservationsInput(game)
    .gameCourts.filter((gc) => gc.reservation === 'REPORTED' && gc.courtId)
    .map((gc) => gc.courtId as string);
}
