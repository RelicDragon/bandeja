import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { bookingMatchesClubCourts } from '@/components/booktime/booktimeBookingUtils';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import type { AggregatedBooktimeBooking } from './useBooktimeAllUpcoming';

export function useBooktimeAllPast(
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
      setLoading(false);
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
          const res = await client.getPreviousBookings(0, 20);
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
          console.error('Club booking past failed for club', club.clubId, err);
        }
      }
      all.sort((a, b) => new Date(b.bookingStart).getTime() - new Date(a.bookingStart).getTime());
      setBookings(all);
    } finally {
      setLoading(false);
    }
  }, [connectedClubs, enabled]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { bookings, loading, reload };
}
