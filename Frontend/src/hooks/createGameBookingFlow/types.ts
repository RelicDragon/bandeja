import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';

export type CreateGameBookingOverrides = {
  externalBookingIds?: string[];
  bookingSnapshots?: BookingSnapshotInput[];
  hasBookedCourt?: boolean;
  startTime?: string;
  endTime?: string;
  timeOverride?: boolean;
  courtIds?: string[];
};

export type CreateGameBookingFields = {
  courtId?: string;
  courtIds?: string[];
  startTime: string;
  endTime: string;
  timeOverride: boolean;
  hasBookedCourt: boolean;
  externalBookingIds?: string[];
  externalBookingProvider?: 'BOOKTIME';
  bookingSnapshots?: BookingSnapshotInput[];
};

export type CreateGameAbortReason =
  | 'authRequired'
  | 'bookingSelectionRequired'
  | 'bookingRecordsLoading'
  | 'integratedCourtSelectionRequired'
  | 'courtSelectionRequired';

export type CreateGameAttemptResult =
  | { status: 'abort'; reason: CreateGameAbortReason }
  | { status: 'confirm' }
  | { status: 'softOverlap' }
  | { status: 'proceed'; overrides?: CreateGameBookingOverrides };

export type OverlapGateResult = 'skip' | 'ok' | 'hard' | 'soft';
