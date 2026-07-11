import { describe, expect, it, vi } from 'vitest';
import { createChatNearBottomStore } from './chatNearBottomStore';

describe('useThreadMarkReadOnNearBottom transition', () => {
  it('fires markRead only on false → true near-bottom transitions', () => {
    const store = createChatNearBottomStore(false);
    const markRead = vi.fn();
    let prevNear = store.get();

    const onStoreChange = () => {
      const near = store.get();
      if (!prevNear && near) markRead();
      prevNear = near;
    };

    const unsub = store.subscribe(onStoreChange);

    expect(markRead).not.toHaveBeenCalled();

    store.set(true);
    expect(markRead).toHaveBeenCalledTimes(1);

    store.set(false);
    store.set(true);
    expect(markRead).toHaveBeenCalledTimes(2);

    unsub();
  });
});
