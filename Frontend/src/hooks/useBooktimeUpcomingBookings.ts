import { useCallback, useEffect, useState } from 'react';
import type { Club } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

function bookingMatchesClub(booking: BooktimeBookingRecord, club: Club): boolean {
  const externalId = booking.bookingResource?.uuid;
  if (!externalId) return true;
  return (club.courts ?? []).some((c) => c.externalCourtId === externalId);
}

export function useBooktimeUpcomingBookings(
  club: Club,
  companyId: string,
  connected: boolean,
  enabled: boolean
) {
  const [bookings, setBookings] = useState<BooktimeBookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !connected || club.integrationType !== 'BOOKTIME') {
      setBookings([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await hydrateBooktimeSession(club.id, companyId);
      const client = getBooktimeClient(club.id, companyId);
      if (!client.isAuthenticated) {
        setBookings([]);
        return;
      }
      const res = await client.getUpcomingBookings(0, 20);
      const filtered = (res.bookings ?? []).filter((b) => bookingMatchesClub(b, club));
      setBookings(filtered);
    } catch (err) {
      console.error('BookTime upcoming bookings failed:', err);
      setError('loadFailed');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [club, companyId, connected, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const removeBooking = useCallback((bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.uuid !== bookingId));
  }, []);

  return { bookings, loading, error, reload, removeBooking };
}
