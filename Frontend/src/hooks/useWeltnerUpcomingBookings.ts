import { useAuthStore } from '@/store/authStore';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { weltnerApi } from '@/api/weltner';

export function useWeltnerUpcomingBookings(
  club: Club,
  enabled: boolean,
  filterCourts?: Court[],
  refreshKey = 0,
) {
  const userId = useAuthStore((state) => state.user?.id);
  const requestKey = `${userId}:${club.id}:${enabled}`;
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BooktimeBookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const courts = filterCourts ?? club.courts;
  const reload = useCallback(async () => {
    const epoch = ++sequence.current;
    setBookings([]);
    setError(null);
    setLoaded(false);
    if (!enabled || !userId) {
      setLoaded(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await weltnerApi.bookings(club.id);
      if (epoch !== sequence.current) return;
      setResolvedKey(requestKey);
      setBookings(
        rows
          .filter(
            (r) =>
              r.state === 'CONFIRMED' &&
              new Date(r.bookingEnd) > new Date() &&
              (!courts?.length || courts.some((c) => c.id === r.courtId)),
          )
          .map((r) => ({
            uuid: r.externalBookingId,
            bookingStart: r.bookingStart,
            bookingEnd: r.bookingEnd,
            bookingResourceId:
              courts?.find((c) => c.id === r.courtId)?.externalCourtId ?? undefined,
            status: 'CONFIRMED',
          })),
      );
    } catch {
      if (epoch === sequence.current) setError('loadFailed');
    } finally {
      if (epoch === sequence.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [club.id, courts, enabled, userId, requestKey]);
  useEffect(() => {
    const guard = sequence;
    void reload();
    return () => {
      guard.current++;
    };
  }, [reload, refreshKey]);
  const removeBooking = useCallback(
    (id: string) => setBookings((rows) => rows.filter((r) => r.uuid !== id)),
    [],
  );
  return { bookings: enabled && userId && resolvedKey === requestKey ? bookings : [], loading, loaded, error, reload, removeBooking };
}
