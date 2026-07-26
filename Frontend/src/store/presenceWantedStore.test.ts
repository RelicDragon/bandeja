import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresenceWantedStore } from './presenceWantedStore';

describe('presenceWantedStore', () => {
  beforeEach(() => {
    usePresenceWantedStore.setState({ wantedByKey: {} });
  });

  it('setWanted is a no-op when ids are unchanged (same reference notify skip)', () => {
    const listener = vi.fn();
    const unsub = usePresenceWantedStore.subscribe(listener);

    usePresenceWantedStore.getState().setWanted('chat-list:all', ['a', 'b']);
    expect(listener).toHaveBeenCalledTimes(1);

    usePresenceWantedStore.getState().setWanted('chat-list:all', ['a', 'b']);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
  });

  it('setWanted notifies when ids change', () => {
    const listener = vi.fn();
    const unsub = usePresenceWantedStore.subscribe(listener);

    usePresenceWantedStore.getState().setWanted('chat-list:all', ['a']);
    usePresenceWantedStore.getState().setWanted('chat-list:all', ['a', 'b']);
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
  });

  it('clearWanted is a no-op when key is absent', () => {
    const listener = vi.fn();
    const unsub = usePresenceWantedStore.subscribe(listener);

    usePresenceWantedStore.getState().clearWanted('missing');
    expect(listener).not.toHaveBeenCalled();

    unsub();
  });

  it('getMergedWantedIds prefers list keys and caps avatar extras', () => {
    usePresenceWantedStore.getState().setWanted('chat-list:all', ['list-1']);
    usePresenceWantedStore.getState().setWanted('avatar:1', ['list-1', 'av-1']);
    usePresenceWantedStore.getState().setWanted('avatar:2', ['av-2']);

    const merged = usePresenceWantedStore.getState().getMergedWantedIds('self');
    expect(merged).toContain('list-1');
    expect(merged).toContain('av-1');
    expect(merged).toContain('av-2');
    expect(merged).not.toContain('self');
  });
});
