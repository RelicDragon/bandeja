import { describe, expect, it, vi } from 'vitest';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import { bookingErrorMessage, localizeBookingErrorText } from './bookingErrorMessage.util';

const t = vi.fn((key: string, params?: Record<string, string>) => {
  if (key === BOOKING_ERROR_KEYS.sessionExpired) return 'localized session expired';
  if (key === BOOKING_ERROR_KEYS.bookingNotLinked && params?.externalBookingId) {
    return `missing ${params.externalBookingId}`;
  }
  if (key.startsWith('errors.booking.')) return `localized:${key}`;
  return key;
});

describe('bookingErrorMessage', () => {
  it('localizes booking provider codes', () => {
    expect(
      bookingErrorMessage({ code: 'AuthExpired', message: BOOKING_ERROR_KEYS.sessionExpired }, t),
    ).toBe('localized session expired');
  });

  it('localizes i18n keys from Error messages', () => {
    expect(bookingErrorMessage(new Error(BOOKING_ERROR_KEYS.courtNotConfigured), t)).toBe(
      `localized:${BOOKING_ERROR_KEYS.courtNotConfigured}`,
    );
  });

  it('localizes legacy english booking messages', () => {
    expect(bookingErrorMessage(new Error('Club booking session expired'), t)).toBe(
      'localized session expired',
    );
  });

  it('localizes rollback error text', () => {
    expect(localizeBookingErrorText(BOOKING_ERROR_KEYS.providerNotConfigured, t)).toBe(
      `localized:${BOOKING_ERROR_KEYS.providerNotConfigured}`,
    );
  });
});
