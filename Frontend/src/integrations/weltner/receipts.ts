import { weltnerApi, type WeltnerReceipt } from '@/api/weltner';
import { nspadelApi } from '@/api/nspadel';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';

export type AggregatedWeltnerBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  courts: ConnectedBookingClubRow['courts'];
  /** Receipt-only providers: the app lists its own receipts (no provider booking list). */
  integrationType: 'WELTNER' | 'NSPADELSUPABASE';
};

export function weltnerReceiptToBooking(
  receipt: WeltnerReceipt,
  courts: Array<{ id: string; externalCourtId?: string | null }>,
): BooktimeBookingRecord {
  return {
    uuid: receipt.externalBookingId,
    bookingStart: receipt.bookingStart,
    bookingEnd: receipt.bookingEnd,
    bookingResourceId: courts.find((c) => c.id === receipt.courtId)?.externalCourtId ?? undefined,
    status: receipt.state,
  };
}

export async function loadWeltnerBookingsForClubs(
  clubs: ConnectedBookingClubRow[],
  period: 'upcoming' | 'past',
  now = Date.now(),
): Promise<AggregatedWeltnerBooking[]> {
  // One club failing must not hide the other clubs' bookings.
  const settled = await Promise.allSettled(
    clubs
      .filter((c) => (c.integrationType === 'WELTNER' || c.integrationType === 'NSPADELSUPABASE') && c.connected)
      .map(async (club) => {
        const receipts: WeltnerReceipt[] =
          club.integrationType === 'NSPADELSUPABASE'
            ? (await nspadelApi.bookings(club.clubId)).map((r) => ({
                externalBookingId: r.externalBookingId,
                referenceType: r.referenceType,
                upstreamBookingId: null,
                // Receipts may predate the court mapping: fall back to the club's court by external id.
                courtId: r.courtId ?? club.courts.find((c) => c.externalCourtId === r.externalCourtId)?.id ?? '',
                bookingStart: r.bookingStart,
                bookingEnd: r.bookingEnd,
                state: r.state,
              }))
            : await weltnerApi.bookings(club.clubId);
        return receipts
          .filter(
            (r) =>
              r.state === 'CONFIRMED' &&
              (period === 'upcoming'
                ? Date.parse(r.bookingEnd) > now
                : Date.parse(r.bookingEnd) <= now),
          )
          .map((r) => ({
            ...weltnerReceiptToBooking(r, club.courts),
            clubId: club.clubId,
            clubName: club.clubName,
            courts: club.courts,
            integrationType: club.integrationType === 'NSPADELSUPABASE' ? ('NSPADELSUPABASE' as const) : ('WELTNER' as const),
          }));
      }),
  );
  return settled.flatMap((result) => {
    if (result.status === 'fulfilled') return result.value;
    console.error('Weltner bookings failed for a club', result.reason);
    return [];
  });
}
