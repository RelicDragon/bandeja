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

export type CreateGameAttemptResult =
  | { status: 'abort' }
  | { status: 'confirm' }
  | { status: 'softOverlap' }
  | { status: 'proceed'; overrides?: CreateGameBookingOverrides };

export type OverlapGateResult = 'skip' | 'ok' | 'hard' | 'soft';
