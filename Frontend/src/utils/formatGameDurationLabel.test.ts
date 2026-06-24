import { describe, expect, it, vi } from 'vitest';
import { formatGameDurationLabel } from './formatGameDurationLabel';

const t = vi.fn((key: string, opts?: { count?: number; hours?: number; minutes?: number }) => {
  if (key === 'createGame.durationHours') return `${opts?.count}h-full`;
  if (key === 'createGame.durationHoursAndHalf') return `${opts?.hours}.5h-full`;
  if (key === 'createGame.durationHoursMinutes') {
    return `${opts?.hours}h-${opts?.minutes}m-full`;
  }
  return key;
});

describe('formatGameDurationLabel', () => {
  it('formats whole hours', () => {
    expect(formatGameDurationLabel(2, t)).toBe('2h-full');
  });

  it('formats half hours', () => {
    expect(formatGameDurationLabel(1.5, t)).toBe('1.5h-full');
  });

  it('formats other fractions as hours and minutes', () => {
    expect(formatGameDurationLabel(1.25, t)).toBe('1h-15m-full');
  });
});
