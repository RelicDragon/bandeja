import { describe, expect, it } from 'vitest';
import {
  computeFreeSlotsForCourt,
  deriveBusyFromAvailableSlots,
  unionAvailableSlotRanges,
} from './slots';
import type { Club } from '@/types';

const club = {
  id: 'c1',
  city: { timezone: 'Europe/Belgrade' },
} as Club;

const dateKey = '2026-06-12';

describe('slots availability helpers', () => {
  it('derives busy gaps from available slot ranges', () => {
    const ranges = ['08:00-10:00', '12:00-19:00', '20:00-23:00'];
    const busy = deriveBusyFromAvailableSlots(ranges, dateKey, club);
    expect(busy).toHaveLength(2);
  });

  it('computes free slot starts for 60m duration', () => {
    const ranges = ['08:00-10:00', '12:00-19:00', '20:00-23:00'];
    const busy = deriveBusyFromAvailableSlots(ranges, dateKey, club);
    const free60 = computeFreeSlotsForCourt(ranges, busy, 60, club, dateKey);
    expect(free60).toContain('08:00');
    expect(free60).toContain('12:00');
    expect(free60).not.toContain('10:00');
    expect(free60).not.toContain('19:00');
  });

  it('computes free slot starts for 120m duration', () => {
    const ranges = ['08:00-10:00', '12:00-19:00', '20:00-23:00'];
    const busy = deriveBusyFromAvailableSlots(ranges, dateKey, club);
    const free120 = computeFreeSlotsForCourt(ranges, busy, 120, club, dateKey);
    expect(free120).toContain('08:00');
    expect(free120).not.toContain('09:00');
    expect(free120).toContain('12:00');
  });

  it('unions overlapping available slot ranges across courts', () => {
    const union = unionAvailableSlotRanges([
      { availableSlots: ['08:00-10:00', '12:00-14:00'] },
      { availableSlots: ['09:00-11:00', '15:00-18:00'] },
    ]);
    expect(union).toContain('08:00-11:00');
    expect(union).toContain('12:00-14:00');
    expect(union).toContain('15:00-18:00');
  });
});
