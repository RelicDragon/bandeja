import { describe, expect, it, vi } from 'vitest';
import { mismatchLabel } from './mismatchLabel';

// The real i18n lookup maps `playIntent.<period>` to a localized period name.
// Mirroring that here keeps the assertions close to production behavior.
// The catalog uses lowercase i18n keys (playIntent.morning) but uppercase enum
// values, so lookups are case-insensitive on the key tail.
const PERIOD_LABEL: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
  customtime: 'Set hours',
};

const KEY_LABEL: Record<string, string> = {
  'playIntent.mismatchTime': 'Plays {{period}}',
  'playIntent.mismatchTimeAnytime': 'Flexible timing',
  'playIntent.mismatchTimeCustom': 'Custom hours',
  'playIntent.mismatchLevel': 'Different level',
  'playIntent.mismatchClubs': 'Other clubs',
  'playIntent.mismatchDates': 'Other days',
  'playIntent.mismatchGender': 'Different group',
};

// Resolves `playIntent.<period>` and the mismatch keys; interpolates {{period}}.
function makeT() {
  return vi.fn((key: string, opts?: Record<string, unknown>) => {
    if (key.startsWith('playIntent.')) {
      const tail = key.slice('playIntent.'.length).toLowerCase();
      if (tail in PERIOD_LABEL) return PERIOD_LABEL[tail];
    }
    let str = KEY_LABEL[key] ?? opts?.defaultValue ?? key;
    if (opts && typeof opts.period === 'string') {
      str = str.replace('{{period}}', opts.period);
    }
    return str;
  });
}

describe('mismatchLabel', () => {
  it('phrases a concrete time period using the other player\'s period', () => {
    const t = makeT();
    expect(mismatchLabel(t, { reason: 'time', period: 'MORNING' })).toBe('Plays Morning');
    expect(mismatchLabel(t, { reason: 'time', period: 'EVENING' })).toBe('Plays Evening');
    // The period option is forwarded so the template never leaks a raw placeholder.
    expect(t).toHaveBeenCalledWith(
      'playIntent.mismatchTime',
      expect.objectContaining({ period: 'Morning' }),
    );
  });

  it('shows the chosen hour range for a CUSTOM period', () => {
    const t = makeT();
    const label = mismatchLabel(t, {
      reason: 'time',
      period: 'CUSTOM',
      startTime: '11:00',
      endTime: '13:00',
    });
    expect(label).toBe('11:00–13:00');
    expect(t).not.toHaveBeenCalledWith('playIntent.mismatchTimeCustom', expect.anything());
    expect(t).not.toHaveBeenCalledWith('playIntent.mismatchTime', expect.anything());
  });

  it('falls back to Custom hours when a CUSTOM period has no window', () => {
    const t = makeT();
    const label = mismatchLabel(t, { reason: 'time', period: 'CUSTOM' });
    expect(label).toBe('Custom hours');
    expect(label).not.toContain('{{');
    expect(t).toHaveBeenCalledWith('playIntent.mismatchTimeCustom', expect.anything());
  });

  it('treats ANYTIME (and a missing period) as flexible timing', () => {
    const t = makeT();
    expect(mismatchLabel(t, { reason: 'time', period: 'ANYTIME' })).toBe('Flexible timing');
    expect(mismatchLabel(t, { reason: 'time' })).toBe('Flexible timing');
  });

  it('phrases non-time reasons from their own keys', () => {
    const t = makeT();
    expect(mismatchLabel(t, { reason: 'level' })).toBe('Different level');
    expect(mismatchLabel(t, { reason: 'clubs' })).toBe('Other clubs');
    expect(mismatchLabel(t, { reason: 'dates' })).toBe('Other days');
    expect(mismatchLabel(t, { reason: 'gender' })).toBe('Different group');
  });
});
