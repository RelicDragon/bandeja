import { useMemo } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useBooktimeClubAuth } from '@/hooks/useBooktimeClubAuth';
import { useBooktimeUpcomingBookings } from '@/hooks/useBooktimeUpcomingBookings';
import { filterBookingsForClubDate } from '@/components/booktime/filterBookingsForClubDate';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';

const inactiveClubPlaceholder: Club = {
  id: '',
  name: '',
  address: '',
  cityId: '',
  integrationType: 'BOOKTIME',
};

type UseClubDateReservationsArgs = {
  club: Club | undefined;
  companyId: string;
  selectedDate: Date;
  enabled: boolean;
  matchCourts?: Court[];
};

export function useClubDateReservations({
  club,
  companyId,
  selectedDate,
  enabled,
  matchCourts,
}: UseClubDateReservationsArgs) {
  const active = enabled && club != null && companyId.length > 0;
  const { status: auth, loading: authLoading } = useBooktimeClubAuth(club?.id, active);
  const connected = Boolean(auth?.connected);
  const { bookings, loading: bookingsLoading, loaded: bookingsLoaded } = useBooktimeUpcomingBookings(
    club ?? inactiveClubPlaceholder,
    companyId,
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
