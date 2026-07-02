import { describe, expect, it } from 'vitest';
import { buildBooktimeOptionsCacheKey } from './useBooktimeTimeOptions';

describe('buildBooktimeOptionsCacheKey', () => {
  it('scopes cache entries per court', () => {
    expect(buildBooktimeOptionsCacheKey('2026-07-06', 'court-a')).toBe('2026-07-06|court-a');
    expect(buildBooktimeOptionsCacheKey('2026-07-06', 'court-b')).toBe('2026-07-06|court-b');
    expect(buildBooktimeOptionsCacheKey('2026-07-06', null)).toBe('2026-07-06|all');
  });
});
