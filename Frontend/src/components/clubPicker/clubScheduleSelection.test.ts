import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import { scheduleSelectionToForm } from './clubScheduleSelection';

const club = { id: 'club', name: 'Club', city: { timezone: 'Asia/Tokyo' } } as Club;

describe('club schedule selection', () => {
  it('keeps the club calendar day when the instant is on the previous UTC day', () => {
    const result = scheduleSelectionToForm({ club, courtId: 'court', startTime: '2030-01-06T23:30:00Z', endTime: '2030-01-07T01:00:00Z' });
    expect([result.selectedDate.getFullYear(), result.selectedDate.getMonth(), result.selectedDate.getDate()]).toEqual([2030, 0, 7]);
    expect(result.selectedTime).toBe('08:30');
    expect(result.durationHours).toBe(1.5);
    expect(result.courtIds).toEqual(['court']);
  });

  it('uses elapsed duration across a daylight-saving transition', () => {
    const result = scheduleSelectionToForm({ club: { ...club, city: { ...club.city!, timezone: 'Europe/Belgrade' } }, courtId: 'court', startTime: '2030-03-31T00:30:00Z', endTime: '2030-03-31T02:00:00Z' });
    expect(result.selectedTime).toBe('01:30');
    expect(result.durationHours).toBe(1.5);
  });

  it.each(['invalid', '2030-01-06T22:30:00Z'])('rejects an invalid or reversed range: %s', (endTime) => {
    expect(() => scheduleSelectionToForm({ club, courtId: 'court', startTime: '2030-01-06T23:30:00Z', endTime })).toThrow();
  });
});
