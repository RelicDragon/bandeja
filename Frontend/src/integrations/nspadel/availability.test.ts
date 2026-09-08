import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import {
  computeNspadelCourtAvailabilityRows,
  computeNspadelFreeSlotsForCourt,
  mappedNspadelCourts,
  nspadelWorkingMinutes,
} from './availability';

const club = {
  id: 'club-1',
  name: 'NS PADEL CENTAR Novi Sad',
  openingTime: '08:00',
  closingTime: '23:00',
  courts: [
    { id: 'c1', clubId: 'club-1', name: 'Doubles teren', externalCourtId: 'ext-2', isIndoor: false },
    { id: 'c2', clubId: 'club-1', name: 'Singles teren', externalCourtId: 'ext-1', isIndoor: false },
    { id: 'c3', clubId: 'club-1', name: 'No mapping', externalCourtId: null, isIndoor: false },
  ],
} as unknown as Club;

describe('nspadel availability rows', () => {
  it('maps only courts with an external id, sorted by name', () => {
    expect(mappedNspadelCourts(club).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('reads working hours from the club, defaults to 08:00-23:00', () => {
    expect(nspadelWorkingMinutes(club)).toEqual({ open: 480, close: 1380 });
    expect(nspadelWorkingMinutes({} as Club)).toEqual({ open: 480, close: 1380 });
  });

  it('keeps starts whose duration window avoids busy intervals', () => {
    const slots = computeNspadelFreeSlotsForCourt({
      club,
      busy: [{ startTime: '17:00', endTime: '19:00' }],
      durationMinutes: 60,
      dateKey: '2030-01-06',
    });
    expect(slots[0]).toBe('08:00');
    expect(slots).toContain('16:00');
    expect(slots).not.toContain('16:30');
    expect(slots).not.toContain('17:00');
    expect(slots).not.toContain('18:30');
    expect(slots).toContain('19:00');
    expect(slots[slots.length - 1]).toBe('22:00');
  });

  it('builds one row per mapped court from snapshot busy data', () => {
    const rows = computeNspadelCourtAvailabilityRows({
      club,
      courts: mappedNspadelCourts(club),
      snapshotCourts: [
        { courtId: 'c1', externalCourtId: 'ext-2', busySlots: [{ startTime: '10:00', endTime: '11:00' }] },
        { courtId: null, externalCourtId: 'ext-1', busySlots: [] },
      ],
      durationMinutes: 60,
      dateKey: '2030-01-06',
    });
    expect(rows.map((r) => r.court.id)).toEqual(['c1', 'c2']);
    const doubles = rows[0]!;
    expect(doubles.freeSlots).not.toContain('10:00');
    expect(doubles.freeSlots).not.toContain('10:30');
    expect(doubles.freeSlots).toContain('11:00');
    expect(rows[1]!.freeSlots.length).toBeGreaterThan(doubles.freeSlots.length);
  });
});
