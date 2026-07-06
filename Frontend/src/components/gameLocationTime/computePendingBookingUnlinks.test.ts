import { describe, expect, it } from 'vitest';
import {
  computePendingBookingUnlinks,
  resolveEditBookingUnlinks,
} from './computePendingBookingUnlinks';

describe('computePendingBookingUnlinks', () => {
  it('removes deselected initial bookings in bookings mode', () => {
    expect(
      computePendingBookingUnlinks(['booking-a', 'booking-b'], [], ['booking-b'], true),
    ).toEqual(['booking-a']);
  });

  it('removes all initial bookings when selection is cleared after club change', () => {
    expect(computePendingBookingUnlinks(['booking-a'], [], [], true)).toEqual(['booking-a']);
  });
});

describe('resolveEditBookingUnlinks', () => {
  it('unlinks prior bookings replaced by a new book-flow reservation', () => {
    expect(
      resolveEditBookingUnlinks({
        initialLinkedIds: ['booking-a'],
        pendingRemoveBookingIds: [],
        selectedBookingIds: ['booking-a'],
        bookingsMode: true,
        bookFlowBookingIds: ['booking-b'],
      }),
    ).toEqual(['booking-a']);
  });

  it('keeps overlapping bookings when book-flow adds alongside existing links', () => {
    expect(
      resolveEditBookingUnlinks({
        initialLinkedIds: ['booking-a', 'booking-b'],
        pendingRemoveBookingIds: [],
        selectedBookingIds: ['booking-a', 'booking-b'],
        bookingsMode: true,
        bookFlowBookingIds: ['booking-a', 'booking-c'],
      }),
    ).toEqual(['booking-b']);
  });
});
