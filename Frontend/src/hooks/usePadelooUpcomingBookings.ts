import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { bookingMatchesClubCourts } from '@/components/booktime/booktimeBookingUtils';
import { getPadelooClient, hydratePadelooSession } from '@/integrations/padeloo/session';
import {
  isUpcomingPadelooBooking,
  reservationToBookingRecord,
} from '@/integrations/padeloo/padelooReservations';
import { getPadelooClubId, isPadelooClub } from '@shared/clubIntegration';

function areBookingListsEqual(
  left: BooktimeBookingRecord[],
  right: BooktimeBookingRecord[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((booking, index) => booking.uuid === right[index]?.uuid);
}

export function usePadelooUpcomingBookings(
  club: Club,
  connected: boolean,
  enabled: boolean,
  filterCourts?: Court[],
  refreshKey = 0,
) {
  const [bookings, setBookings] = useState<BooktimeBookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padelooClubId = getPadelooClubId(club);
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
    if (!enabled || !connected || !isPadelooClub(club) || padelooClubId == null) {
      setBookings((prev) => (prev.length === 0 ? prev : []));
      setLoaded(true);
      lastLoadedCourtsKeyRef.current = filterCourtsKey;
      return;
    }
    setLoading(true);
    setLoaded(false);
    setError(null);
    try {
      await hydratePadelooSession(club.id, padelooClubId);
      const client = getPadelooClient(club.id, padelooClubId);
      if (!client.isAuthenticated) {
        setBookings([]);
        setLoaded(true);
        lastLoadedCourtsKeyRef.current = filterCourtsKey;
        return;
      }
      const reservations = await client.getMyReservations();
      const courtsForMatch = filterCourtsRef.current ?? club.courts ?? [];
      const raw = reservations
        .filter((row) => row.clubId === padelooClubId)
        .map((row) => reservationToBookingRecord(row, club))
        .filter((row) => isUpcomingPadelooBooking(row));
      const filtered =
        courtsForMatch.length === 0
          ? raw
          : raw.filter((b) => bookingMatchesClubCourts(b, courtsForMatch));
      setBookings((prev) => (areBookingListsEqual(prev, filtered) ? prev : filtered));
      setLoaded(true);
      lastLoadedCourtsKeyRef.current = filterCourtsKey;
    } catch (err) {
      console.error('Padeloo upcoming failed:', err);
      setError('loadFailed');
      setBookings([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [club, connected, enabled, filterCourtsKey, padelooClubId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const removeBooking = useCallback((bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.uuid !== bookingId));
  }, []);

  return { bookings, loading, loaded, error, reload, removeBooking };
}
