import { weltnerApi, type WeltnerReceipt } from '@/api/weltner';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';

export type AggregatedWeltnerBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  courts: ConnectedBookingClubRow['courts'];
  integrationType: 'WELTNER';
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
  const rows = await Promise.all(
    clubs
      .filter((c) => c.integrationType === 'WELTNER' && c.connected)
      .map(async (club) => {
        const receipts = await weltnerApi.bookings(club.clubId);
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
            integrationType: 'WELTNER' as const,
          }));
      }),
  );
  return rows.flat();
}
