import { useMemo } from 'react';
import type { ConnectedBookingClubsPayload } from '@/hooks/connectedBookingClubs';
import { useConnectedBookingClubs } from '@/hooks/useConnectedBookingClubs';
import { useAllUpcomingClubBookings } from '@/hooks/useAllUpcomingClubBookings';
import type { AggregatedClubBooking } from '@/hooks/useAllUpcomingClubBookings';

export type MyTabClubBookingsSnapshot = {
  myClubs: ConnectedBookingClubsPayload | null;
  clubs: ConnectedBookingClubsPayload['clubs'];
  bookings: AggregatedClubBooking[];
  bookingsLoading: boolean;
  reloadMyClubs: () => Promise<ConnectedBookingClubsPayload | null>;
  reloadBookings: () => Promise<void>;
  removeBooking: (bookingId: string) => void;
};

export function useMyTabClubBookings(): MyTabClubBookingsSnapshot {
  const { data: myClubs, reload: reloadMyClubs } = useConnectedBookingClubs(true);
  const clubs = useMemo(() => myClubs?.clubs ?? [], [myClubs?.clubs]);
  const { bookings, loading: bookingsLoading, removeBooking, reload: reloadBookings } =
    useAllUpcomingClubBookings(clubs, true);

  // Passed down as one `booktime` prop, so the snapshot identity has to track
  // its contents rather than the render count.
  return useMemo(
    () => ({
      myClubs,
      clubs,
      bookings,
      bookingsLoading,
      reloadMyClubs,
      reloadBookings,
      removeBooking,
    }),
    [myClubs, clubs, bookings, bookingsLoading, reloadMyClubs, reloadBookings, removeBooking],
  );
}
