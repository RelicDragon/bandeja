export type BusySlot = {
  startTime: string;
  endTime: string;
};

export type BusySnapshotCourt = {
  courtId: string | null;
  externalCourtId: string;
  externalCourtName?: string | null;
  busySlots: BusySlot[];
};

export type BusySnapshotPayload = {
  dateKey: string;
  courts: BusySnapshotCourt[];
};

export type ExternalBookingResult = {
  externalBookingId: string;
  bookingStart: string;
  bookingEnd: string;
  price?: number;
  /** The club's court id (provider side), when the provider reports it (upcoming lists). */
  externalCourtId?: string | null;
};

export type BookingErrorCode = 'SlotTaken' | 'AuthExpired' | 'RollbackFailed';

export type BookingProviderError = {
  code: BookingErrorCode;
  message: string;
};

export function bookingProviderError(code: BookingErrorCode, message: string): BookingProviderError {
  return { code, message };
}

export type RollbackBookingResult = {
  externalBookingId: string;
  attempted: boolean;
  cancelled: boolean;
  error?: string;
};
