import {
  projectEditReservationActionToState,
  projectReservationIntentToState,
  resolveCreateReservationCtaKey,
  resolveEditReservationValidation,
  resolveInitialEditReservationAction,
  resolveInitialReservationIntent,
  resolveReservationValidation,
  resolveReservationValidationMessage,
} from './reservationIntent';
import { describe, expect, it } from 'vitest';

describe('reservation intent resolvers', () => {
  it('initializes create intent from deep links, integrations, and manual state', () => {
    expect(
      resolveInitialReservationIntent({
        hasPreselectedBookings: true,
        clubBookingFlowActive: true,
      }),
    ).toBe('useExisting');
    expect(
      resolveInitialReservationIntent({
        hasPreselectedBookings: false,
        clubBookingFlowActive: true,
      }),
    ).toBe('reserveNow');
    expect(
      resolveInitialReservationIntent({
        hasPreselectedBookings: false,
        clubBookingFlowActive: false,
        initialHasBookedCourt: true,
      }),
    ).toBe('manualBooked');
    expect(
      resolveInitialReservationIntent({
        hasPreselectedBookings: false,
        clubBookingFlowActive: false,
      }),
    ).toBe('gameOnly');
  });

  it('projects create intents to legacy location-time state', () => {
    expect(
      projectReservationIntentToState({
        intent: 'reserveNow',
        selectedBookingIds: ['old'],
        hasBookedCourt: true,
        needsBooktimeAuth: false,
      }),
    ).toMatchObject({
      locationTimeMode: 'timeSlots',
      selectedBookingIds: [],
      skipRealCourtBooking: false,
      hasBookedCourt: false,
      opensBooktimeConfirm: true,
    });

    expect(
      projectReservationIntentToState({
        intent: 'useExisting',
        selectedBookingIds: ['booking-1'],
        hasBookedCourt: false,
        needsBooktimeAuth: false,
      }),
    ).toMatchObject({
      locationTimeMode: 'bookings',
      selectedBookingIds: ['booking-1'],
      hasBookedCourt: true,
      opensBooktimeConfirm: false,
    });

    expect(
      projectReservationIntentToState({
        intent: 'gameOnly',
        selectedBookingIds: ['booking-1'],
        hasBookedCourt: true,
        needsBooktimeAuth: false,
      }),
    ).toMatchObject({
      selectedBookingIds: [],
      skipRealCourtBooking: true,
      hasBookedCourt: false,
    });

    expect(
      projectReservationIntentToState({
        intent: 'manualBooked',
        selectedBookingIds: [],
        hasBookedCourt: false,
        needsBooktimeAuth: false,
      }),
    ).toMatchObject({
      skipRealCourtBooking: true,
      hasBookedCourt: true,
    });
  });

  it('projects edit actions without relying on selected booking ids as visible intent', () => {
    expect(
      resolveInitialEditReservationAction({
        hasLinkedBookings: true,
        clubBookingFlowActive: true,
      }),
    ).toBe('keepCurrent');

    expect(
      projectEditReservationActionToState({
        action: 'keepCurrent',
        initialLinkedBookingIds: ['booking-1'],
        selectedBookingIds: [],
        hasBookedCourt: false,
        needsBooktimeAuth: false,
      }),
    ).toMatchObject({
      locationTimeMode: 'bookings',
      selectedBookingIds: ['booking-1'],
      preservesLinkedBookings: true,
      removesLinkedBookings: false,
    });

    expect(
      projectEditReservationActionToState({
        action: 'unlink',
        initialLinkedBookingIds: ['booking-1'],
        selectedBookingIds: ['booking-1'],
        hasBookedCourt: true,
        needsBooktimeAuth: false,
      }),
    ).toMatchObject({
      locationTimeMode: 'timeSlots',
      selectedBookingIds: [],
      hasBookedCourt: false,
      removesLinkedBookings: true,
    });
  });

  it('validates user-facing intent before projecting payloads', () => {
    expect(
      resolveReservationValidation({
        intent: 'reserveNow',
        needsBooktimeAuth: true,
        selectedBookingCount: 0,
        bookingSelectionMin: 1,
      }),
    ).toEqual({ ok: false, reason: 'authRequired' });

    expect(
      resolveReservationValidation({
        intent: 'useExisting',
        needsBooktimeAuth: false,
        selectedBookingCount: 1,
        bookingSelectionMin: 2,
      }),
    ).toEqual({ ok: false, reason: 'bookingSelectionRequired' });

    expect(
      resolveReservationValidation({
        intent: 'reserveNow',
        needsBooktimeAuth: false,
        selectedBookingCount: 0,
        selectedCourtCount: 0,
        bookingSelectionMin: 1,
      }),
    ).toEqual({ ok: false, reason: 'integratedCourtSelectionRequired' });

    expect(
      resolveReservationValidation({
        intent: 'useExisting',
        needsBooktimeAuth: false,
        selectedBookingCount: 1,
        selectedBookingRecordsCount: 0,
        bookingSelectionMin: 1,
      }),
    ).toEqual({ ok: false, reason: 'bookingRecordsLoading' });

    expect(
      resolveReservationValidation({
        intent: 'reserveNow',
        needsBooktimeAuth: false,
        selectedBookingCount: 0,
        selectedCourtCount: 1,
        bookingSelectionMin: 1,
        selectedTime: '18:00',
        duration: 1.5,
      }),
    ).toEqual({ ok: true });
  });

  it('validates edit reservation actions', () => {
    expect(
      resolveEditReservationValidation({
        action: 'keepCurrent',
        needsBooktimeAuth: false,
        selectedBookingCount: 1,
        selectedBookingRecordsCount: 1,
        selectedCourtCount: 1,
        integratedCourtCount: 1,
        bookingSelectionMin: 1,
        requiresSchedule: false,
      }),
    ).toEqual({ ok: true });

    expect(
      resolveEditReservationValidation({
        action: 'gameOnly',
        needsBooktimeAuth: false,
        selectedBookingCount: 0,
        selectedBookingRecordsCount: 0,
        selectedCourtCount: 0,
        integratedCourtCount: 0,
        bookingSelectionMin: 1,
        requiresSchedule: true,
      }),
    ).toEqual({ ok: false, reason: 'timeRequired' });
  });

  it('resolves intent-specific create CTA keys', () => {
    expect(resolveCreateReservationCtaKey({ intent: 'reserveNow', requiredReservationCount: 2 })).toEqual({
      key: 'createGame.reservationIntent.cta.reserveMany',
      values: { count: 2 },
    });
    expect(resolveCreateReservationCtaKey({ intent: 'gameOnly', requiredReservationCount: 1 })).toEqual({
      key: 'createGame.reservationIntent.cta.gameOnly',
    });
  });

  it('maps validation failures to user-facing toast keys', () => {
    expect(
      resolveReservationValidationMessage({ ok: false, reason: 'authRequired' }, 2),
    ).toEqual({ key: 'createGame.booktime.signInToContinue' });
    expect(
      resolveReservationValidationMessage({ ok: false, reason: 'bookingSelectionRequired' }, 2),
    ).toEqual({
      key: 'createGame.reservationIntent.validation.selectReservations',
      values: { count: 2 },
    });
  });
});
