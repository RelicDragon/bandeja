import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { bookingMatchesClubCourts, resolveBooktimeMyClubTimezone } from '@/components/booktime/booktimeBookingUtils';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';

export type AggregatedBooktimeBooking = BooktimeBookingRecord & {
  clubId: string;
  clubName: string;
  companyId: string;
  courts: BooktimeMyClubRow['courts'];
};

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
          const clubTimeZone = resolveBooktimeMyClubTimezone(club);
          await hydrateBooktimeSession(club.clubId, club.companyId!, clubTimeZone);
          const client = getBooktimeClient(club.clubId, club.companyId!, clubTimeZone);
          if (!client.isAuthenticated) continue;
          const res = await client.getUpcomingBookings(0, 20);
          for (const booking of res.bookings ?? []) {
            if (!bookingMatchesClubCourts(booking, club.courts)) continue;
            all.push({
              ...booking,
              clubId: club.clubId,
              clubName: club.clubName,
              companyId: club.companyId!,
              courts: club.courts,
            });
          }
        } catch (err) {
          console.error('Club booking upcoming failed for club', club.clubId, err);
        }
      }
      all.sort((a, b) => booktimeBookingStartMs(a.bookingStart) - booktimeBookingStartMs(b.bookingStart));
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
