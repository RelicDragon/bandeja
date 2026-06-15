import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { resolveBooktimeMyClubTimezone } from '@/components/booktime/booktimeBookingUtils';
import { bookingMatchesClubCourts } from '@/components/booktime/booktimeBookingUtils';

function areBookingListsEqual(
  left: BooktimeBookingRecord[],
  right: BooktimeBookingRecord[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((booking, index) => booking.uuid === right[index]?.uuid);
}

export function useBooktimeUpcomingBookings(
  club: Club,
  companyId: string,
  connected: boolean,
  enabled: boolean,
  filterCourts?: Court[],
) {
  const [bookings, setBookings] = useState<BooktimeBookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterCourtsRef = useRef(filterCourts);
  filterCourtsRef.current = filterCourts;
  const filterCourtsKey = useMemo(
    () =>
      (filterCourts ?? [])
        .map((court) => court.id)
        .sort()
        .join('\0'),
    [filterCourts],
  );

  const lastLoadedCourtsKeyRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !connected || club.integrationType !== 'BOOKTIME') {
      setBookings([]);
      lastLoadedCourtsKeyRef.current = filterCourtsKey;
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const clubTimeZone = resolveBooktimeMyClubTimezone(club);
      await hydrateBooktimeSession(club.id, companyId, clubTimeZone);
      const client = getBooktimeClient(club.id, companyId, clubTimeZone);
      if (!client.isAuthenticated) {
        setBookings([]);
        lastLoadedCourtsKeyRef.current = filterCourtsKey;
        return;
      }
      const res = await client.getUpcomingBookings(0, 20);
      const courtsForMatch = filterCourtsRef.current ?? club.courts ?? [];
      const raw = res.bookings ?? [];
      const filtered =
        courtsForMatch.length === 0
          ? raw
          : raw.filter((b) => bookingMatchesClubCourts(b, courtsForMatch));
      setBookings((prev) => (areBookingListsEqual(prev, filtered) ? prev : filtered));
      lastLoadedCourtsKeyRef.current = filterCourtsKey;
    } catch (err) {
      console.error('Club booking upcoming failed:', err);
      setError('loadFailed');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [club, companyId, connected, enabled, filterCourtsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const removeBooking = useCallback((bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.uuid !== bookingId));
  }, []);

  return { bookings, loading, error, reload, removeBooking };
}
