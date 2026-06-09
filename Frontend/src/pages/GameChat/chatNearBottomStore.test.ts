import { describe, expect, it, vi } from 'vitest';
import { createChatNearBottomStore } from './chatNearBottomStore';

describe('createChatNearBottomStore', () => {
  it('notifies subscribers only when value changes', () => {
    const store = createChatNearBottomStore(true);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(true);
    expect(listener).not.toHaveBeenCalled();

    store.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toBe(false);
  });
});
