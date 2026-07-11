import { describe, expect, it } from 'vitest';
import type { Court } from '@/types';
import { resolveReservationFetchCourts, resolveReservationPickerCourts } from './resolveReservationPickerCourts';

const courts = [
  { id: 'court-a', name: 'Court A' },
  { id: 'court-b', name: 'Court B' },
] as Court[];

describe('resolveReservationPickerCourts', () => {
  it('returns all match courts before a court is selected', () => {
    expect(
      resolveReservationPickerCourts({
        selectedCourtIds: [],
        courts,
        bookingMatchCourts: courts,
      }).map((court) => court.id),
    ).toEqual(['court-a', 'court-b']);
  });

  it('narrows reservation candidates to the selected court', () => {
    expect(
      resolveReservationPickerCourts({
        selectedCourtIds: ['court-a'],
        courts,
        bookingMatchCourts: courts,
      }).map((court) => court.id),
    ).toEqual(['court-a']);
  });

  it('keeps multi-court selections in selected order', () => {
    expect(
      resolveReservationPickerCourts({
        selectedCourtIds: ['court-b', 'court-a'],
        courts,
        bookingMatchCourts: courts,
      }).map((court) => court.id),
    ).toEqual(['court-b', 'court-a']);
  });
});

describe('resolveReservationFetchCourts', () => {
  it('uses all club courts when linking existing reservations', () => {
    expect(
      resolveReservationFetchCourts({
        locationTimeMode: 'bookings',
        selectedCourtIds: ['court-a'],
        courts,
        bookingMatchCourts: courts,
      }).map((court) => court.id),
    ).toEqual(['court-a', 'court-b']);
  });

  it('narrows courts for reserve-now scheduling', () => {
    expect(
      resolveReservationFetchCourts({
        locationTimeMode: 'timeSlots',
        selectedCourtIds: ['court-a'],
        courts,
        bookingMatchCourts: courts,
      }).map((court) => court.id),
    ).toEqual(['court-a']);
  });
});
