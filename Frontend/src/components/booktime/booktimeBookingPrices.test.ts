import { describe, expect, it } from 'vitest';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import {
  bookingPriceQuote,
  buildBooktimePriceById,
  sumBooktimeBookingPrices,
} from './booktimeBookingPrices';

function booking(uuid: string, price?: number): BooktimeBookingRecord {
  return {
    uuid,
    bookingStart: '2026-06-15T10:00:00.000Z',
    bookingEnd: '2026-06-15T11:00:00.000Z',
    price,
  };
}

describe('bookingPriceQuote', () => {
  it('returns null when booking has no price', () => {
    expect(bookingPriceQuote(booking('a'), 'RSD')).toBeNull();
  });

  it('returns null when list API sends price 0 (unknown)', () => {
    expect(bookingPriceQuote(booking('a', 0), 'RSD')).toBeNull();
  });

  it('returns quote when price and currency are present', () => {
    expect(bookingPriceQuote(booking('a', 4000), 'RSD')).toEqual({
      amount: 4000,
      currency: 'RSD',
    });
  });
});

describe('buildBooktimePriceById', () => {
  it('maps each booking uuid to its quote', () => {
    const bookings = [booking('a', 1000), booking('b', 1500)];
    const priceById = buildBooktimePriceById(bookings, 'RSD');

    expect(priceById.get('a')).toEqual({ amount: 1000, currency: 'RSD' });
    expect(priceById.get('b')).toEqual({ amount: 1500, currency: 'RSD' });
  });
});

describe('sumBooktimeBookingPrices', () => {
  it('returns null when any slot is missing a price', () => {
    const bookings = [booking('a', 1000), booking('b')];
    expect(sumBooktimeBookingPrices(bookings, 'RSD')).toBeNull();
  });

  it('sums prices with the same currency', () => {
    const bookings = [booking('a', 1000), booking('b', 1500)];
    expect(sumBooktimeBookingPrices(bookings, 'RSD')).toEqual({
      amount: 2500,
      currency: 'RSD',
    });
  });
});
