import { describe, expect, it } from 'vitest';
import { resolveFindDayKey } from './findDayFromSearchParams';

describe('resolveFindDayKey', () => {
  const ref = new Date('2026-07-14T15:30:00.000Z');

  it('prefers explicit date', () => {
    expect(
      resolveFindDayKey({ date: '2026-08-01', dayOffset: '1' }, ref),
    ).toBe('2026-08-01');
  });

  it('resolves dayOffset from local start of reference day', () => {
    expect(resolveFindDayKey({ dayOffset: '0' }, ref)).toBe(
      resolveFindDayKey({ dayOffset: '0' }, ref),
    );
    const today = resolveFindDayKey({ dayOffset: '0' }, ref);
    const tomorrow = resolveFindDayKey({ dayOffset: '1' }, ref);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tomorrow).not.toBe(today);
  });

  it('rejects invalid date and offset', () => {
    expect(resolveFindDayKey({ date: '07-14-2026' }, ref)).toBeNull();
    expect(resolveFindDayKey({ dayOffset: 'nope' }, ref)).toBeNull();
    expect(resolveFindDayKey({}, ref)).toBeNull();
  });
});
