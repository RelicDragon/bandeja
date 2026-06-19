import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import {
  invalidateBooktimeAllUpcomingCache,
  loadAllBooktimeUpcoming,
  type AggregatedBooktimeBooking,
} from '@/integrations/booktime/booktimeAllUpcomingLoader';

export type { AggregatedBooktimeBooking };

export function useBooktimeAllUpcoming(
  clubs: BooktimeMyClubRow[],
  enabled: boolean,
  refreshKey = 0
) {
  const [bookings, setBookings] = useState<AggregatedBooktimeBooking[]>([]);
  const [loading, setLoading] = useState(false);

  const connectedKey = useMemo(
    () =>
      clubs
        .filter((club) => club.connected && club.companyId)
        .map((club) => club.clubId)
        .sort()
        .join('|'),
    [clubs],
  );

  const reload = useCallback(async () => {
    if (!enabled || connectedKey.length === 0) {
      setBookings((prev) => (prev.length === 0 ? prev : []));
      setLoading((prev) => (prev ? false : prev));
      return;
    }
    setLoading(true);
    try {
      const all = await loadAllBooktimeUpcoming(clubs, enabled);
      setBookings(all);
    } finally {
      setLoading(false);
    }
  }, [clubs, connectedKey, enabled]);

  useEffect(() => {
    if (refreshKey > 0) {
      invalidateBooktimeAllUpcomingCache();
    }
    void reload();
  }, [reload, refreshKey]);

  return {
    bookings,
    loading,
    reload,
    removeBooking: (bookingId: string) => {
      invalidateBooktimeAllUpcomingCache();
      setBookings((prev) => prev.filter((booking) => booking.uuid !== bookingId));
    },
  };
}
