import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_MUTATION_FLUSH_DONE_EVENT,
  CHAT_MUTATION_FLUSH_FAILED_EVENT,
} from '@/services/chat/chatMutationEvents';
import {
  CHAT_OUTBOX_FAILED_EVENT,
  CHAT_OUTBOX_REMOVED_EVENT,
} from '@/services/chat/chatOutboxEvents';
import { subscribeMutationRetryRefresh } from './mutationRetryRefreshSubscription';

describe('mutationRetryRefreshSubscription', () => {
  const listeners = new Map<string, Set<EventListener>>();

  beforeEach(() => {
    vi.stubGlobal('window', {
      dispatchEvent: (ev: Event) => {
        const set = listeners.get(ev.type);
        set?.forEach((fn) => fn(ev));
        return true;
      },
      addEventListener: (type: string, fn: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        listeners.get(type)?.delete(fn);
      },
    });
  });

  afterEach(() => {
    listeners.clear();
    vi.unstubAllGlobals();
  });

  it('refreshes on matching failure and removed events', () => {
    const refresh = vi.fn();
    const unsubscribe = subscribeMutationRetryRefresh({
      contextType: 'GAME',
      contextId: 'game-1',
      refresh,
    });

    window.dispatchEvent(
      new CustomEvent(CHAT_OUTBOX_FAILED_EVENT, {
        detail: { contextType: 'GAME', contextId: 'game-1' },
      })
    );
    window.dispatchEvent(
      new CustomEvent(CHAT_MUTATION_FLUSH_FAILED_EVENT, {
        detail: { contextType: 'GAME', contextId: 'game-2' },
      })
    );
    window.dispatchEvent(
      new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, {
        detail: { contextType: 'GAME', contextId: 'game-1', tempIds: ['opt-1'] },
      })
    );
    window.dispatchEvent(new CustomEvent(CHAT_MUTATION_FLUSH_DONE_EVENT));

    expect(refresh).toHaveBeenCalledTimes(3);

    unsubscribe();
  });
});
