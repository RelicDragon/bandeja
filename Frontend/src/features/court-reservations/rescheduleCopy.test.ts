import { describe, expect, it } from 'vitest';
import type { PlanStep } from '@shared/gameBooking/planReschedule';
import { createClubTimeFormatter } from './clubTime';
import { stepLabel } from './rescheduleCopy';
import type { CourtReservationText } from './useCourtReservationText';

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')}` : key) as CourtReservationText['t'];
const clock = createClubTimeFormatter({ timeZone: 'UTC', locale: 'en-GB', hour12: false });
const text = { t, clock } as unknown as CourtReservationText;

const save = {
  kind: 'save_game',
  idempotencyKey: 'k',
  start: '2026-10-05T19:00:00.000Z',
  end: '2026-10-05T21:00:00.000Z',
} as unknown as PlanStep;

describe('save step label — notice count excludes the editor', () => {
  it('nobody else to tell → just "Save the new time …"', () => {
    const label = stepLabel(save, {}, text, { playerCount: 0 });
    expect(label.startsWith('run.step.saveRange|')).toBe(true);
    expect(label).not.toContain('count=');
  });

  it('other players → "… and tell N players"', () => {
    expect(stepLabel(save, {}, text, { playerCount: 2 })).toContain('run.step.saveAndTell|');
    expect(stepLabel(save, {}, text, { playerCount: 2 })).toContain('count=2');
  });
});
