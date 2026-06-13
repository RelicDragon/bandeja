import { describe, expect, it } from 'vitest';
import { BOOKTIME_SNAPSHOT_FRESH_MS } from './booktimeSnapshotFreshness';

describe('BOOKTIME_SNAPSHOT_FRESH_MS', () => {
  it('is 60 seconds per epic #122', () => {
    expect(BOOKTIME_SNAPSHOT_FRESH_MS).toBe(60 * 1000);
  });
});
