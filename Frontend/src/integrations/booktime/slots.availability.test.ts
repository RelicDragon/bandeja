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

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const ranges = ['08:00-10:00', '12:00-19:00', '20:00-23:00'];
const busy = deriveBusyFromAvailableSlots(ranges, dateKey, club);
assert(busy.length === 2, 'two internal gaps marked busy');

const free60 = computeFreeSlotsForCourt(ranges, busy, 60, club, dateKey);
assert(free60.includes('08:00'), '08:00 start for 60m');
assert(free60.includes('12:00'), '12:00 start for 60m');
assert(!free60.includes('10:00'), 'gap start hidden');
assert(!free60.includes('19:00'), 'second gap start hidden');

const free120 = computeFreeSlotsForCourt(ranges, busy, 120, club, dateKey);
assert(free120.includes('08:00'), '08:00 fits 120m in first range');
assert(!free120.includes('09:00'), '09:00 cannot fit 120m in first range');
assert(free120.includes('12:00'), '12:00 fits 120m in middle range');

const union = unionAvailableSlotRanges([
  { availableSlots: ['08:00-10:00', '12:00-14:00'] },
  { availableSlots: ['09:00-11:00', '15:00-18:00'] },
]);
assert(union.includes('08:00-11:00'), 'union merges overlaps');
assert(union.includes('12:00-14:00'), 'union keeps separate block');
assert(union.includes('15:00-18:00'), 'union keeps second court block');

console.log('ok: slots.availability.test.ts');
