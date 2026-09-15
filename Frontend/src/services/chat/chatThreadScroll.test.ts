import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushThreadScrollSave, scheduleThreadScrollSave } from './chatThreadScroll';

const { put } = vi.hoisted(() => ({ put: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./chatLocalDb', () => ({ chatLocalDb: { threadScroll: { put } } }));
afterEach(() => { vi.useRealTimers(); put.mockClear(); });

describe('saved history pixel offset', () => {
  it('updates the offset when scrolling within the same visible message', () => {
    vi.useFakeTimers();
    scheduleThreadScrollSave('USER:offset', { atBottom: false, anchorMessageId: 'm1', anchorOffsetPx: -10 });
    scheduleThreadScrollSave('USER:offset', { atBottom: false, anchorMessageId: 'm1', anchorOffsetPx: -45 });
    flushThreadScrollSave('USER:offset');
    expect(put).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ anchorMessageId: 'm1', anchorOffsetPx: -45 }));
  });
});
