import { describe, expect, it } from 'vitest';
import {
  BOOKTIME_SNAPSHOT_FRESH_MS,
  BOOKTIME_SNAPSHOT_PUT_COOLDOWN_MS,
  BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW,
} from './booktimeSnapshotFreshness';

describe('BOOKTIME_SNAPSHOT_FRESH_MS', () => {
  it('is 60 seconds per epic #122', () => {
    expect(BOOKTIME_SNAPSHOT_FRESH_MS).toBe(60 * 1000);
  });
});

describe('BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW', () => {
  it('allows 10 puts per freshness window', () => {
    expect(BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW).toBe(10);
    expect(BOOKTIME_SNAPSHOT_PUT_COOLDOWN_MS).toBe(6 * 1000);
  });
});
