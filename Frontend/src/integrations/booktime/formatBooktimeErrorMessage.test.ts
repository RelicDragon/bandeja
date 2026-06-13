import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import { describe, expect, it } from 'vitest';
import { BooktimeSlotTakenError } from './bookFlow';
import { formatBooktimeErrorMessage } from './formatBooktimeErrorMessage';

describe('formatBooktimeErrorMessage', () => {
  it('joins Booktime API body fields', () => {
    const err = Object.assign(new Error('Bad Request'), {
      status: 400,
      data: { errorCode: 'BOOKING_CONFLICT', message: 'Termin nije dostupan' },
    });
    expect(formatBooktimeErrorMessage(err)).toBe('Termin nije dostupan — BOOKING_CONFLICT — Bad Request');
  });

  it('reads axios-style response payloads', () => {
    const err = {
      response: {
        status: 502,
        data: { message: 'Booktime unavailable', error: 'upstream_failed' },
      },
    };
    expect(formatBooktimeErrorMessage(err)).toBe('Booktime unavailable — upstream_failed');
  });

  it('falls back to Error message', () => {
    expect(formatBooktimeErrorMessage(new Error(BOOKING_ERROR_KEYS.courtNotConfigured))).toBe(
      BOOKING_ERROR_KEYS.courtNotConfigured,
    );
  });

  it('uses BooktimeSlotTakenError message', () => {
    expect(formatBooktimeErrorMessage(new BooktimeSlotTakenError('Court already booked'))).toBe(
      'Court already booked',
    );
  });
});
