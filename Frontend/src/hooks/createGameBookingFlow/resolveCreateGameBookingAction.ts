import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';
import type { ReservationIntent } from '@shared/gameBooking/reservationIntent';
import type { CreateGameAttemptResult, OverlapGateResult } from './types';

export type ResolveCreateGameBookingActionInput = {
  needsBooktimeAuth: boolean;
  locationTimeMode: LocationTimeMode;
  selectedBookingCount: number;
  selectedBookingRecordsCount: number;
  bookingSelectionMin: number;
  willBookOnCreate: boolean;
  integratedCourtCount: number;
  selectedCourt: string;
  selectedCourtCount: number;
  reservationIntent?: ReservationIntent;
  overlapGate: OverlapGateResult;
};

export function resolveCreateGameBookingAction(
  input: ResolveCreateGameBookingActionInput,
): CreateGameAttemptResult {
  if (input.needsBooktimeAuth) {
    if (!input.reservationIntent && input.locationTimeMode === 'timeSlots') {
      return { status: 'proceed', overrides: { hasBookedCourt: false } };
    }
    if (input.reservationIntent === 'gameOnly') {
      return { status: 'proceed', overrides: { hasBookedCourt: false } };
    }
    if (input.reservationIntent === 'manualBooked') {
      return { status: 'proceed', overrides: { hasBookedCourt: true } };
    }
    return { status: 'abort' };
  }

  if (input.reservationIntent === 'useExisting' || input.locationTimeMode === 'bookings') {
    if (input.selectedBookingCount < input.bookingSelectionMin) {
      return { status: 'abort' };
    }
    if (input.selectedBookingRecordsCount < input.selectedBookingCount) {
      return { status: 'abort' };
    }
    return { status: 'proceed' };
  }

  if (input.reservationIntent === 'gameOnly') {
    return { status: 'proceed', overrides: { hasBookedCourt: false, externalBookingIds: [] } };
  }

  if (input.reservationIntent === 'manualBooked') {
    return { status: 'proceed', overrides: { hasBookedCourt: true, externalBookingIds: [] } };
  }

  if (
    input.reservationIntent === 'reserveNow' &&
    input.integratedCourtCount < input.bookingSelectionMin
  ) {
    return { status: 'abort' };
  }

  if (
    input.willBookOnCreate &&
    input.integratedCourtCount > 0 &&
    input.selectedCourt === 'notBooked' &&
    input.selectedCourtCount === 0
  ) {
    return { status: 'abort' };
  }

  if (input.overlapGate === 'hard') {
    return { status: 'abort' };
  }
  if (input.overlapGate === 'soft') {
    return { status: 'softOverlap' };
  }

  if (input.willBookOnCreate && input.integratedCourtCount > 0) {
    return { status: 'confirm' };
  }

  return { status: 'proceed' };
}
