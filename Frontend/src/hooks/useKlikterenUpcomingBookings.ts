import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { bookingMatchesClubCourts } from '@/components/booktime/booktimeBookingUtils';
import { getKlikterenClient, hydrateKlikterenSession } from '@/integrations/klikteren/session';
import {
  isUpcomingKlikterenBooking,
  bookingToBookingRecord,
} from '@/integrations/klikteren/klikterenReservations';
import { getKlikterenVenueId, isKlikterenClub } from '@shared/clubIntegration';

function areBookingListsEqual(
  left: BooktimeBookingRecord[],
  right: BooktimeBookingRecord[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((booking, index) => booking.uuid === right[index]?.uuid);
}

export function useKlikterenUpcomingBookings(
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
  const klikterenVenueId = getKlikterenVenueId(club);
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
    if (!enabled || !connected || !isKlikterenClub(club) || klikterenVenueId == null) {
      setBookings((prev) => (prev.length === 0 ? prev : []));
      setLoaded(true);
      lastLoadedCourtsKeyRef.current = filterCourtsKey;
      return;
    }
    setLoading(true);
    setLoaded(false);
    setError(null);
    try {
      await hydrateKlikterenSession(club.id, klikterenVenueId);
      const client = getKlikterenClient(club.id, klikterenVenueId);
      if (!client.isAuthenticated) {
        setBookings([]);
        setLoaded(true);
        lastLoadedCourtsKeyRef.current = filterCourtsKey;
        return;
      }
      const rows = await client.getMyBookings();
      const courtsForMatch = filterCourtsRef.current ?? club.courts ?? [];
      const raw = rows
        .filter((row) => !row.venueId || row.venueId === klikterenVenueId)
        .map((row) => bookingToBookingRecord(row, club, klikterenVenueId))
        .filter((row) => isUpcomingKlikterenBooking(row));
      const filtered =
        courtsForMatch.length === 0
          ? raw
          : raw.filter((b) => bookingMatchesClubCourts(b, courtsForMatch));
      setBookings((prev) => (areBookingListsEqual(prev, filtered) ? prev : filtered));
      setLoaded(true);
      lastLoadedCourtsKeyRef.current = filterCourtsKey;
    } catch (err) {
      console.error('Klikteren upcoming failed:', err);
      setError('loadFailed');
      setBookings([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [club, connected, enabled, filterCourtsKey, klikterenVenueId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const removeBooking = useCallback((bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.uuid !== bookingId));
  }, []);

  return { bookings, loading, loaded, error, reload, removeBooking };
}
