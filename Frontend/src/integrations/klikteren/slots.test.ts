import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import {
  deriveBusyFromAvailableSlotsInWorkingHours,
  freeStartTimesToDurationSlots,
  mapKlikterenAvailabilityToSnapshotCourts,
} from '@/integrations/klikteren/slots';

const club = {
  id: 'c1',
  city: { timezone: 'Europe/Belgrade' },
  courts: [{ id: 'court-1', externalCourtId: '5', name: 'Teren 1' }],
} as Club;

const dateKey = '2026-07-14';

describe('klikteren slots mapping', () => {
  it('derives busy gaps within working hours from available slots', () => {
    const busy = deriveBusyFromAvailableSlotsInWorkingHours(
      [
        { startTime: '09:00', endTime: '10:00' },
        { startTime: '11:00', endTime: '12:00' },
      ],
      dateKey,
      club,
    );
    // 08:00–09:00, 10:00–11:00, 12:00–23:00
    expect(busy).toHaveLength(3);
  });

  it('builds duration slots from consecutive free starts', () => {
    const slots = freeStartTimesToDurationSlots(
      ['09:00', '09:30', '10:00', '10:30'],
      60,
    );
    expect(slots.map((slot) => slot.startTime)).toEqual(['09:00', '09:30', '10:00']);
  });

  it('maps availability free starts to snapshot courts', () => {
    const mapped = mapKlikterenAvailabilityToSnapshotCourts(
      club,
      {
        courtFreeSlots: {
          '5': ['09:00', '09:30', '10:00', '10:30'],
        },
      },
      dateKey,
      60,
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.externalCourtId).toBe('5');
    expect(mapped[0]?.courtId).toBe('court-1');
  });
});
