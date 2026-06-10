import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export type AggregatedBooktimeBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  companyId: string;
  courts: BooktimeMyClubRow['courts'];
};

function bookingMatchesClub(booking: BooktimeBookingRecord, courts: BooktimeMyClubRow['courts']): boolean {
  const externalId = booking.bookingResource?.uuid;
  if (!externalId) return true;
  return courts.some((c) => c.externalCourtId === externalId);
}

export function useBooktimeAllUpcoming(
  clubs: BooktimeMyClubRow[],
  enabled: boolean,
  refreshKey = 0
) {
  const [bookings, setBookings] = useState<AggregatedBooktimeBooking[]>([]);
  const [loading, setLoading] = useState(false);

  const connectedClubs = useMemo(
    () => clubs.filter((c) => c.connected && c.companyId),
    [clubs]
  );

  const reload = useCallback(async () => {
    if (!enabled || connectedClubs.length === 0) {
      setBookings((prev) => (prev.length === 0 ? prev : []));
      setLoading((prev) => (prev ? false : prev));
      return;
    }
    setLoading(true);
    try {
      const all: AggregatedBooktimeBooking[] = [];
      for (const club of connectedClubs) {
        try {
          await hydrateBooktimeSession(club.clubId, club.companyId!);
          const client = getBooktimeClient(club.clubId, club.companyId!);
          if (!client.isAuthenticated) continue;
          const res = await client.getUpcomingBookings(0, 20);
          for (const booking of res.bookings ?? []) {
            if (!bookingMatchesClub(booking, club.courts)) continue;
            all.push({
              ...booking,
              clubId: club.clubId,
              clubName: club.clubName,
              companyId: club.companyId!,
              courts: club.courts,
            });
          }
        } catch (err) {
          console.error('BookTime upcoming failed for club', club.clubId, err);
        }
      }
      all.sort((a, b) => new Date(a.bookingStart).getTime() - new Date(b.bookingStart).getTime());
      setBookings(all);
    } finally {
      setLoading(false);
    }
  }, [connectedClubs, enabled]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { bookings, loading, reload, removeBooking: (bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.uuid !== bookingId));
  } };
}
