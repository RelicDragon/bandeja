import { createContext } from 'react';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { TimeGridCellReservationState } from '@shared/gameBooking/mapBookingsToTimeGridCells';

export type ReservationGridSyncValue = {
  enabled: boolean;
  dateBookings: readonly BooktimeBookingRecord[];
  clubTimezone: string;
  selectedBookingIds: readonly string[];
  highlightedBookingIds: readonly string[];
  registerCardRef: (bookingId: string, element: HTMLElement | null) => void;
  handleGridCellTap: (cell: TimeGridCellReservationState) => boolean;
  clearBookingSelection: () => void;
};

export const ReservationGridSyncContext = createContext<ReservationGridSyncValue | null>(null);
