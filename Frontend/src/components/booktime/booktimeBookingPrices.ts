import type { BooktimeBookingRecord } from '@/integrations/booktime/client';

export type BooktimeBookingPriceQuote = {
  amount: number;
  currency: string;
} | null;

export function bookingPriceQuote(
  booking: BooktimeBookingRecord,
  currency: string,
): BooktimeBookingPriceQuote {
  if (booking.price == null || !currency) return null;
  return { amount: booking.price, currency };
}

export function buildBooktimePriceById(
  bookings: BooktimeBookingRecord[],
  currency: string,
): Map<string, BooktimeBookingPriceQuote> {
  return new Map(
    bookings.map((booking) => [booking.uuid, bookingPriceQuote(booking, currency)]),
  );
}

export function sumBooktimeBookingPrices(
  bookings: BooktimeBookingRecord[],
  currency: string,
): BooktimeBookingPriceQuote {
  const quotes = bookings.map((booking) => bookingPriceQuote(booking, currency));
  if (quotes.some((quote) => quote === null)) return null;
  const priced = quotes as NonNullable<BooktimeBookingPriceQuote>[];
  if (priced.length === 0) return null;
  const currencies = new Set(priced.map((quote) => quote.currency));
  if (currencies.size !== 1) return null;
  return {
    amount: priced.reduce((sum, quote) => sum + quote.amount, 0),
    currency: priced[0]!.currency,
  };
}
