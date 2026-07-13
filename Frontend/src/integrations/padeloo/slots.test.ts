import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import {
  deriveBusyFromAvailableSlotsInWorkingHours,
  mapPadelooAvailableSlotsToSnapshotCourts,
} from '@/integrations/padeloo/slots';
import type { PadelooAvailableCourtRow } from '@/integrations/padeloo/client';

const club = {
  id: 'c1',
  city: { timezone: 'Europe/Belgrade' },
  courts: [{ id: 'court-1', externalCourtId: '5', name: 'Teren 1' }],
} as Club;

const dateKey = '2026-07-14';

describe('padeloo slots mapping', () => {
  it('derives busy gaps within working hours from available slots', () => {
    const busy = deriveBusyFromAvailableSlotsInWorkingHours(
      [
        { startTime: '09:00', endTime: '10:00' },
        { startTime: '11:00', endTime: '12:00' },
      ],
      dateKey,
      club,
    );
    expect(busy).toHaveLength(2);
  });

  it('maps available slot rows to snapshot courts', () => {
    const rows: PadelooAvailableCourtRow[] = [
      {
        courtId: 5,
        courtName: 'Teren 1',
        date: dateKey,
        durationMinutes: 60,
        price: 3000,
        slots: [
          { startTime: '09:00', endTime: '10:00', price: 3000 },
          { startTime: '10:00', endTime: '11:00', price: 3000 },
        ],
      },
    ];
    const mapped = mapPadelooAvailableSlotsToSnapshotCourts(club, rows, dateKey);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.externalCourtId).toBe('5');
    expect(mapped[0]?.courtId).toBe('court-1');
  });
});
