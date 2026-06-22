import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { TimeGridCellReservationState } from '@shared/gameBooking/mapBookingsToTimeGridCells';
import {
  ReservationGridSyncContext,
  type ReservationGridSyncValue,
} from './reservationGridSync.context';

type ReservationGridSyncProviderProps = {
  enabled: boolean;
  dateBookings: readonly BooktimeBookingRecord[];
  clubTimezone: string;
  selectedBookingIds: readonly string[];
  onSelectedBookingIdsChange: (ids: string[], records: BooktimeBookingRecord[]) => void;
  onToggleBooking: (bookingId: string) => void;
  children: ReactNode;
};

export function ReservationGridSyncProvider({
  enabled,
  dateBookings,
  clubTimezone,
  selectedBookingIds,
  onSelectedBookingIdsChange,
  onToggleBooking,
  children,
}: ReservationGridSyncProviderProps) {
  const [highlightedBookingIds, setHighlightedBookingIds] = useState<string[]>([]);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    setHighlightedBookingIds([]);
  }, [selectedBookingIds]);

  const registerCardRef = useCallback((bookingId: string, element: HTMLElement | null) => {
    if (element) {
      cardRefs.current.set(bookingId, element);
      return;
    }
    cardRefs.current.delete(bookingId);
  }, []);

  const scrollToCards = useCallback((bookingIds: readonly string[]) => {
    for (const id of bookingIds) {
      const el = cardRefs.current.get(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        break;
      }
    }
  }, []);

  const clearBookingSelection = useCallback(() => {
    if (selectedBookingIds.length === 0) return;
    onSelectedBookingIdsChange([], []);
    setHighlightedBookingIds([]);
  }, [onSelectedBookingIdsChange, selectedBookingIds.length]);

  const handleGridCellTap = useCallback(
    (cell: TimeGridCellReservationState): boolean => {
      if (!enabled || !cell.hasReservation) return false;

      if (cell.coveringBookingIds.length > 1) {
        setHighlightedBookingIds([...cell.coveringBookingIds]);
        scrollToCards(cell.coveringBookingIds);
        return true;
      }

      setHighlightedBookingIds([]);
      onToggleBooking(cell.coveringBookingIds[0]!);
      return true;
    },
    [enabled, onToggleBooking, scrollToCards],
  );

  const value = useMemo(
    (): ReservationGridSyncValue => ({
      enabled,
      dateBookings,
      clubTimezone,
      selectedBookingIds,
      highlightedBookingIds,
      registerCardRef,
      handleGridCellTap,
      clearBookingSelection,
    }),
    [
      enabled,
      dateBookings,
      clubTimezone,
      selectedBookingIds,
      highlightedBookingIds,
      registerCardRef,
      handleGridCellTap,
      clearBookingSelection,
    ],
  );

  return (
    <ReservationGridSyncContext.Provider value={enabled ? value : null}>
      {children}
    </ReservationGridSyncContext.Provider>
  );
}
