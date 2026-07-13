export type ExternalBookingProvider = 'BOOKTIME' | 'PADELOO';

export interface GameLinkedBooking {
  id: string;
  externalBookingId: string;
  externalBookingProvider: ExternalBookingProvider;
  courtId?: string;
  bookingStart?: string;
  bookingEnd?: string;
}

export interface BookingSnapshotInput {
  externalBookingId: string;
  courtId?: string;
  bookingStart?: string;
  bookingEnd?: string;
}

export interface PatchGameBookingsBody {
  add?: string[];
  remove?: string[];
}

export interface PutGameBookingSnapshotsBody {
  snapshots: BookingSnapshotInput[];
}

export interface LinkBookingToGamePatch {
  clubId?: string;
  courtId?: string;
  startTime?: string;
  endTime?: string;
  timeIsSet?: boolean;
  hasBookedCourt?: boolean;
}

export interface LinkBookingToGameBody {
  externalBookingId: string;
  snapshot: BookingSnapshotInput;
  gamePatch?: LinkBookingToGamePatch;
}

export interface CreateGameBookingFields {
  externalBookingIds?: string[];
  externalBookingProvider?: ExternalBookingProvider;
  bookingSnapshots?: BookingSnapshotInput[];
  timeOverride?: boolean;
}

import { BOOKING_ERROR_KEYS } from '../booking/errorKeys';

export const LEGACY_EXTERNAL_BOOKING_ID_REJECTED = BOOKING_ERROR_KEYS.legacyExternalBookingIdRejected;
