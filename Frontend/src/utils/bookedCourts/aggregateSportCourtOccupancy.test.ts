import { describe, expect, it } from 'vitest';
import type { BookedCourtSlot, Court } from '@/types';
import {
  areAggregateSlotsUnconfirmed,
  buildCourtTimeSlotMap,
  filterBookingsByCourts,
  isAggregateTimeBooked,
  isAggregateTimeFullyExternallyBlocked,
} from './aggregateSportCourtOccupancy';

const padelCourts: Court[] = [
  { id: 'c1', name: 'Court 1', clubId: 'club1', sport: 'PADEL' } as Court,
  { id: 'c2', name: 'Court 2', clubId: 'club1', sport: 'PADEL' } as Court,
];

const formatTime = (date: Date) =>
  `${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}`;

function booking(
  courtId: string,
  start: string,
  end: string,
  clubBooked = false,
): BookedCourtSlot {
  return {
    courtId,
    courtName: courtId,
    startTime: start,
    endTime: end,
    hasBookedCourt: !clubBooked,
    clubBooked,
  };
}

describe('aggregateSportCourtOccupancy', () => {
  it('filters bookings to sport courts only', () => {
    const bookings = [
      booking('c1', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
      booking('tennis-1', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
    ];
    expect(filterBookingsByCourts(bookings, padelCourts)).toHaveLength(1);
  });

  it('marks slot booked when any sport court is occupied', () => {
    const bookings = [
      booking('c1', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', true),
    ];
    const map = buildCourtTimeSlotMap(bookings, undefined, formatTime);
    expect(isAggregateTimeBooked('10:00', padelCourts, map)).toBe(true);
  });

  it('does not mark fully external when a sport court is free', () => {
    const bookings = [
      booking('c1', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', true),
    ];
    const map = buildCourtTimeSlotMap(bookings, undefined, formatTime);
    expect(isAggregateTimeFullyExternallyBlocked('10:00', padelCourts, map)).toBe(false);
  });

  it('marks fully external only when all sport courts are externally blocked', () => {
    const bookings = [
      booking('c1', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', true),
      booking('c2', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', true),
    ];
    const map = buildCourtTimeSlotMap(bookings, undefined, formatTime);
    expect(isAggregateTimeFullyExternallyBlocked('10:00', padelCourts, map)).toBe(true);
  });

  it('treats mixed game bookings as unconfirmed yellow state', () => {
    const bookings = [
      booking('c1', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', false),
      booking('c2', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', true),
    ];
    const map = buildCourtTimeSlotMap(bookings, undefined, formatTime);
    expect(isAggregateTimeFullyExternallyBlocked('10:00', padelCourts, map)).toBe(false);
    expect(areAggregateSlotsUnconfirmed('10:00', padelCourts, map)).toBe(false);
  });

  it('ignores other-sport bookings when filtering', () => {
    const bookings = [
      booking('t1', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', true),
    ];
    const filtered = filterBookingsByCourts(bookings, padelCourts);
    const map = buildCourtTimeSlotMap(filtered, undefined, formatTime);
    expect(isAggregateTimeBooked('10:00', padelCourts, map)).toBe(false);
    expect(isAggregateTimeFullyExternallyBlocked('10:00', padelCourts, map)).toBe(false);
  });
});
