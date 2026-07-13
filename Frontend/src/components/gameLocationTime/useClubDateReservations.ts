import { useMemo } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { filterBookingsForClubDate } from '@/components/booktime/filterBookingsForClubDate';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { useClubBookingAuth } from '@/hooks/useClubBookingAuth';
import { useClubUpcomingBookings } from '@/hooks/useClubUpcomingBookings';

type UseClubDateReservationsArgs = {
  club: Club | undefined;
  selectedDate: Date;
  enabled: boolean;
  matchCourts?: Court[];
};

export function useClubDateReservations({
  club,
  selectedDate,
  enabled,
  matchCourts,
}: UseClubDateReservationsArgs) {
  const active = enabled && club != null && clubHasBookingIntegration(club);
  const { status: auth, loading: authLoading } = useClubBookingAuth(club, active);
  const connected = Boolean(auth?.connected);
  const { bookings, loading: bookingsLoading, loaded: bookingsLoaded } = useClubUpcomingBookings(
    club,
    connected,
    active,
    matchCourts,
  );

  const clubTimezone = club ? getClubTimezone(club) : 'UTC';
  const dateBookings = useMemo(
    () => (club ? filterBookingsForClubDate(bookings, selectedDate, club) : []),
    [bookings, selectedDate, club],
  );

  return {
    auth,
    connected,
    authLoading,
    bookings,
    dateBookings,
    bookingsLoading,
    bookingsLoaded,
    clubTimezone,
  };
}

export type ClubDateReservations = ReturnType<typeof useClubDateReservations>;

export function findBookingRecords(
  bookings: BooktimeBookingRecord[],
  ids: readonly string[],
): BooktimeBookingRecord[] {
  return bookings.filter((b) => ids.includes(b.uuid));
}
