import { useMemo } from 'react';
import type { BooktimeMyClubsPayload } from '@/api/booktime';
import { useBooktimeMyClubs } from '@/hooks/useBooktimeMyClubs';
import { useBooktimeAllUpcoming } from '@/hooks/useBooktimeAllUpcoming';
import type { AggregatedBooktimeBooking } from '@/hooks/useBooktimeAllUpcoming';

export type MyTabBooktimeSnapshot = {
  myClubs: BooktimeMyClubsPayload | null;
  clubs: BooktimeMyClubsPayload['clubs'];
  bookings: AggregatedBooktimeBooking[];
  bookingsLoading: boolean;
  reloadMyClubs: () => Promise<BooktimeMyClubsPayload | null>;
  reloadBookings: () => Promise<void>;
  removeBooking: (bookingId: string) => void;
};

export function useMyTabBooktime(): MyTabBooktimeSnapshot {
  const { data: myClubs, reload: reloadMyClubs } = useBooktimeMyClubs(true);
  const clubs = useMemo(() => myClubs?.clubs ?? [], [myClubs?.clubs]);
  const { bookings, loading: bookingsLoading, removeBooking, reload: reloadBookings } = useBooktimeAllUpcoming(
    clubs,
    true,
  );

  return {
    myClubs,
    clubs,
    bookings,
    bookingsLoading,
    reloadMyClubs,
    reloadBookings,
    removeBooking,
  };
}

export type { MyTabPanelCounts } from '@/hooks/useMyTabPanelCounts';
