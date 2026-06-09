import { describe, expect, it } from 'vitest';
import { plannerForSheet } from './leaguePlannerSheet';
import type { LeaguePlannerPayload } from '@/api/leagues';

describe('plannerForSheet', () => {
  const payload = { weekStart: '2026-06-09' } as LeaguePlannerPayload;

  it('uses deferred planner while live planner is cleared during refetch', () => {
    expect(plannerForSheet(null, payload)).toBe(payload);
  });

  it('prefers live planner when both exist', () => {
    const next = { weekStart: '2026-06-16' } as LeaguePlannerPayload;
    expect(plannerForSheet(next, payload)).toBe(next);
  });

  it('returns null when neither planner snapshot exists', () => {
    expect(plannerForSheet(null, null)).toBeNull();
  });
});
