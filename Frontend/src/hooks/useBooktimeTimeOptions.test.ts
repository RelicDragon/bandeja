import { describe, expect, it } from 'vitest';
import { buildBooktimeOptionsCacheKey } from './useBooktimeTimeOptions';

describe('buildBooktimeOptionsCacheKey', () => {
  it('scopes cache entries per court and duration', () => {
    expect(buildBooktimeOptionsCacheKey('2026-07-06', 'court-a', 60)).toBe('2026-07-06|court-a|60');
    expect(buildBooktimeOptionsCacheKey('2026-07-06', 'court-b', 60)).toBe('2026-07-06|court-b|60');
    expect(buildBooktimeOptionsCacheKey('2026-07-06', 'court-a', 90)).toBe('2026-07-06|court-a|90');
    expect(buildBooktimeOptionsCacheKey('2026-07-06', null, 60)).toBe('2026-07-06|all|60');
  });
});
