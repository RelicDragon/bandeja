import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import {
  buildNspadelEndTime,
  mapNspadelAvailabilityToSnapshotCourts,
  parseTimeLabelToMinutes,
} from './slots';

const club: Club = {
  id: 'club-ns',
  name: 'NS PADEL CENTAR Novi Sad',
  address: 'Novosadski put 138, Novi Sad',
  cityId: 'city-1',
  integrationType: 'NSPADELSUPABASE',
  integrationConfig: { supabaseUrl: 'https://xyzcompany.supabase.co' },
  courts: [{ id: 'court-1', name: 'Teren 1', clubId: 'club-ns', isIndoor: true, externalCourtId: 'ext-1' }],
};

describe('mapNspadelAvailabilityToSnapshotCourts', () => {
  it('maps free slots to busy complements inside working hours', () => {
    const courts = mapNspadelAvailabilityToSnapshotCourts(
      club,
      {
        slots: [{ courtId: 'ext-1', courtName: 'Teren 1', startTime: '10:00', endTime: '12:00' }],
      },
      60,
    );
    expect(courts).toHaveLength(1);
    expect(courts[0]!.courtId).toBe('court-1');
    expect(courts[0]!.busySlots).toEqual([
      { startTime: '08:00', endTime: '10:00' },
      { startTime: '12:00', endTime: '23:00' },
    ]);
  });

  it('keeps locally known courts with empty busy data when upstream is empty', () => {
    const courts = mapNspadelAvailabilityToSnapshotCourts(club, { slots: [] }, 60);
    expect(courts).toHaveLength(1);
    expect(courts[0]!.busySlots).toEqual([]);
  });
});

describe('nspadel time helpers', () => {
  it('builds end time from duration', () => {
    expect(buildNspadelEndTime('10:00', 90)).toBe('11:30');
    expect(parseTimeLabelToMinutes('08:00')).toBe(480);
    expect(parseTimeLabelToMinutes('bad')).toBeNull();
  });
});
