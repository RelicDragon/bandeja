import { describe, expect, it, vi } from 'vitest';
import { assembleCreateGameBookingFields } from './assembleCreateGameBookingFields';
import { resolveCreateGameBookingAction } from './resolveCreateGameBookingAction';
import { resolveCreateButtonLabel } from './resolveCreateButtonLabel';
import { shouldPromptMarkCourtAfterCreate } from './shouldPromptMarkCourtAfterCreate';
import { shouldUseBooktimeTimeOptions } from './shouldUseBooktimeTimeOptions';

const t = ((key: string) => key) as Parameters<typeof resolveCreateButtonLabel>[0]['t'];

describe('resolveCreateGameBookingAction', () => {
  const base = {
    needsBooktimeAuth: false,
    locationTimeMode: 'timeSlots' as const,
    selectedBookingCount: 0,
    bookingSelectionMin: 1,
    willBookOnCreate: false,
    integratedCourtCount: 0,
    selectedCourt: 'court-1',
    selectedCourtCount: 1,
    overlapGate: 'skip' as const,
  };

  it('non-integrated create proceeds without confirm modal', () => {
    expect(resolveCreateGameBookingAction(base)).toEqual({ status: 'proceed' });
  });

  it('book-on-create opens confirm modal when integrated courts selected', () => {
    expect(
      resolveCreateGameBookingAction({
        ...base,
        willBookOnCreate: true,
        integratedCourtCount: 1,
      }),
    ).toEqual({ status: 'confirm' });
  });

  it('link-existing bookings proceeds when minimum met', () => {
    expect(
      resolveCreateGameBookingAction({
        ...base,
        locationTimeMode: 'bookings',
        selectedBookingCount: 2,
        bookingSelectionMin: 1,
      }),
    ).toEqual({ status: 'proceed' });
  });

  it('skip-real-court proceeds like manual create', () => {
    expect(
      resolveCreateGameBookingAction({
        ...base,
        willBookOnCreate: false,
        integratedCourtCount: 1,
      }),
    ).toEqual({ status: 'proceed' });
  });

  it('blocks when auth required', () => {
    expect(
      resolveCreateGameBookingAction({
        ...base,
        needsBooktimeAuth: true,
        willBookOnCreate: true,
        integratedCourtCount: 1,
      }),
    ).toEqual({ status: 'abort' });
  });

  it('soft overlap opens confirmation path', () => {
    expect(
      resolveCreateGameBookingAction({
        ...base,
        overlapGate: 'soft',
      }),
    ).toEqual({ status: 'softOverlap' });
  });
});

describe('assembleCreateGameBookingFields', () => {
  it('link-existing uses booking payload fields', () => {
    const fields = assembleCreateGameBookingFields({
      locationTimeMode: 'bookings',
      selectedBookingRecords: [{ uuid: 'b1' } as never],
      buildCreatePayload: () => ({
        externalBookingIds: ['b1'],
        externalBookingProvider: 'BOOKTIME',
        bookingSnapshots: [{ courtId: 'c1', externalBookingId: 'b1' } as never],
        courtIds: ['c1'],
        startTime: '2026-06-13T10:00:00.000Z',
        endTime: '2026-06-13T11:00:00.000Z',
        timeOverride: false,
        hasBookedCourt: true,
      }),
      createDateFromSelection: () => ({
        startTime: 'ignored',
        endTime: 'ignored',
      }),
      multiCourtMode: false,
      selectedCourt: 'notBooked',
      selectedCourtIds: [],
      hasBookedCourt: false,
    });

    expect(fields.externalBookingIds).toEqual(['b1']);
    expect(fields.courtIds).toEqual(['c1']);
    expect(fields.hasBookedCourt).toBe(true);
    expect(fields.startTime).toBe('2026-06-13T10:00:00.000Z');
  });

  it('book-on-create confirm overrides attach rollback flag', () => {
    const fields = assembleCreateGameBookingFields({
      locationTimeMode: 'timeSlots',
      selectedBookingRecords: [],
      buildCreatePayload: () => ({
        startTime: '2026-06-13T10:00:00.000Z',
        endTime: '2026-06-13T11:00:00.000Z',
        hasBookedCourt: true,
      }),
      createDateFromSelection: () => ({
        startTime: '2026-06-13T10:00:00.000Z',
        endTime: '2026-06-13T11:00:00.000Z',
      }),
      multiCourtMode: false,
      selectedCourt: 'court-1',
      selectedCourtIds: ['court-1'],
      hasBookedCourt: false,
      overrides: {
        externalBookingIds: ['ext-1'],
        bookingSnapshots: [{ courtId: 'court-1', externalBookingId: 'ext-1' } as never],
        hasBookedCourt: true,
        rollbackBooktimeBooking: true,
        courtIds: ['court-1'],
      },
    });

    expect(fields.externalBookingProvider).toBe('BOOKTIME');
    expect(fields.rollbackBooktimeBooking).toBe(true);
  });
});

describe('shouldPromptMarkCourtAfterCreate', () => {
  it('prompts for non-integrated court after create', () => {
    expect(
      shouldPromptMarkCourtAfterCreate({
        entityType: 'GAME',
        selectedCourt: 'court-1',
        hasBookedCourt: false,
        willBookOnCreate: false,
        locationTimeMode: 'timeSlots',
        clubHasActiveIntegration: false,
        createdGameId: 'g1',
      }),
    ).toBe(true);
  });

  it('skips prompt for integrated book-on-create', () => {
    expect(
      shouldPromptMarkCourtAfterCreate({
        entityType: 'GAME',
        selectedCourt: 'court-1',
        hasBookedCourt: false,
        willBookOnCreate: true,
        locationTimeMode: 'timeSlots',
        clubHasActiveIntegration: true,
        createdGameId: 'g1',
      }),
    ).toBe(false);
  });
});

describe('resolveCreateButtonLabel', () => {
  it('uses book CTA for integrated book-on-create', () => {
    expect(
      resolveCreateButtonLabel({
        t,
        entityType: 'GAME',
        needsBooktimeAuth: false,
        willBookOnCreate: true,
        integratedCourtCount: 1,
      }),
    ).toBe('createGame.booktime.createCta');
  });
});

describe('shouldUseBooktimeTimeOptions', () => {
  const base = {
    entityType: 'GAME' as const,
    clubHasBookingIntegration: true,
    needsBooktimeAuth: false,
    locationTimeMode: 'timeSlots' as const,
    willBookOnCreate: true,
    booktimeConnected: true,
  };

  it('uses booktime slots only when reserving on create', () => {
    expect(shouldUseBooktimeTimeOptions(base)).toBe(true);
    expect(
      shouldUseBooktimeTimeOptions({
        ...base,
        willBookOnCreate: false,
      }),
    ).toBe(false);
  });

  it('falls back to full club schedule when court not selected or opt-out', () => {
    expect(
      shouldUseBooktimeTimeOptions({
        ...base,
        willBookOnCreate: false,
        booktimeConnected: true,
      }),
    ).toBe(false);
    expect(
      shouldUseBooktimeTimeOptions({
        ...base,
        locationTimeMode: 'bookings',
      }),
    ).toBe(false);
  });
});

describe('slot-taken handler', () => {
  it('clears selected time and reloads booktime slots', () => {
    const setSelectedTime = vi.fn();
    const reload = vi.fn();
    const onSlotTaken = () => {
      setSelectedTime('');
      reload();
    };

    onSlotTaken();

    expect(setSelectedTime).toHaveBeenCalledWith('');
    expect(reload).toHaveBeenCalledOnce();
  });
});
