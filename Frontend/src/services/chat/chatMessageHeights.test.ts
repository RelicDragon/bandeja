import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMessageHeightMemoryCache,
  getCachedMessageRowHeight,
  preloadMessageRowHeights,
  rememberMeasuredMessageHeight,
  seedEphemeralMessageRowHeight,
  seedMessageRowHeights,
} from './chatMessageHeights';

const { bulkGet } = vi.hoisted(() => ({ bulkGet: vi.fn() }));
vi.mock('./chatLocalDb', () => ({
  chatLocalDb: { messageRowHeights: { bulkGet } },
}));

beforeEach(() => {
  vi.useFakeTimers();
  clearMessageHeightMemoryCache();
  bulkGet.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('message height restoration', () => {
  it('does not replace a current DOM measurement with stale disk geometry', async () => {
    let resolve!: (rows: { heightPx: number }[]) => void;
    bulkGet.mockReturnValue(new Promise((done) => { resolve = done; }));
    seedEphemeralMessageRowHeight('media', 80);
    const preload = preloadMessageRowHeights(['media']);
    rememberMeasuredMessageHeight('media', 240);
    resolve([{ heightPx: 120 }]);
    await preload;
    expect(getCachedMessageRowHeight('media')).toBe(240);
  });

  it('preserves measured L1 geometry when restoring older disk heights', async () => {
    seedMessageRowHeights({ media: 240 });
    bulkGet.mockResolvedValue([{ heightPx: 120 }]);
    await preloadMessageRowHeights(['media']);
    expect(getCachedMessageRowHeight('media')).toBe(240);
  });

  it('replaces a heuristic placeholder with a persisted measurement', async () => {
    seedEphemeralMessageRowHeight('media', 80);
    bulkGet.mockResolvedValue([{ heightPx: 120 }]);
    await preloadMessageRowHeights(['media']);
    expect(getCachedMessageRowHeight('media')).toBe(120);
  });
});


describe('height preload lifetime', () => {
  it('does not change geometry after the caller moves away from the tail', async () => {
    bulkGet.mockResolvedValue([{ heightPx: 120 }]);
    seedEphemeralMessageRowHeight('media', 80);
    await preloadMessageRowHeights(['media'], () => false);
    expect(getCachedMessageRowHeight('media')).toBe(80);
  });

  it('cannot repopulate a cleared cache from an older in-flight read', async () => {
    let resolve!: (rows: { heightPx: number }[]) => void;
    bulkGet.mockReturnValue(new Promise((done) => { resolve = done; }));
    const preload = preloadMessageRowHeights(['media']);
    clearMessageHeightMemoryCache();
    resolve([{ heightPx: 120 }]);
    await preload;
    expect(getCachedMessageRowHeight('media')).toBeUndefined();
  });

  it('promotes an accurate heuristic to a real measurement', async () => {
    seedEphemeralMessageRowHeight('media', 120);
    rememberMeasuredMessageHeight('media', 120);
    bulkGet.mockResolvedValue([{ heightPx: 80 }]);
    await preloadMessageRowHeights(['media']);
    expect(getCachedMessageRowHeight('media')).toBe(120);
    expect(bulkGet).not.toHaveBeenCalled();
  });
});
