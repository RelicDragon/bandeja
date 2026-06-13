import type {
  BusySnapshotCourt,
  ExternalBookingResult,
} from '@shared/booking';

export type BookSlotParams = {
  courtId: string;
  externalCourtId: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  durationMinutes: number;
};

export type BookSlotContext = {
  refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>;
  lastFetchedAt: string | null;
};

export interface ClubBookingProvider {
  bookSlot(
    params: BookSlotParams,
    selectedDate: Date,
    context: BookSlotContext,
  ): Promise<ExternalBookingResult>;

  cancelBooking(
    externalBookingId: string,
    refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>,
  ): Promise<void>;

  listUpcoming(index?: number, size?: number): Promise<ExternalBookingResult[]>;

  fetchSnapshotCourts(selectedDate: Date, dateKey: string): Promise<BusySnapshotCourt[]>;
}
