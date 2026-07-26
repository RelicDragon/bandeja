// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresenceSubscriptionManager } from './usePresenceSubscriptionManager';
import { usePresenceWantedStore } from '@/store/presenceWantedStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useAuthStore } from '@/store/authStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const subscribePresence = vi.fn();
const getConnectionStatus = vi.fn(() => true);
const on = vi.fn();
const off = vi.fn();

vi.mock('@/services/socketService', () => ({
  socketService: {
    subscribePresence: (...args: unknown[]) => subscribePresence(...args),
    getConnectionStatus: () => getConnectionStatus(),
    on: (...args: unknown[]) => on(...args),
    off: (...args: unknown[]) => off(...args),
  },
}));

vi.mock('@/api', () => ({
  usersApi: {
    getPresence: vi.fn(async () => ({})),
  },
}));

function Harness() {
  usePresenceSubscriptionManager();
  return null;
}

describe('usePresenceSubscriptionManager', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    subscribePresence.mockClear();
    getConnectionStatus.mockReturnValue(true);
    on.mockClear();
    off.mockClear();
    usePresenceWantedStore.setState({ wantedByKey: {} });
    usePresenceStore.setState({ online: {} });
    useSocketEventsStore.setState({ initialized: true } as never);
    useAuthStore.setState({
      user: { id: 'self', showOnlineStatus: true },
      isAuthenticated: true,
      token: 't',
    } as never);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('does not re-subscribe on identical wanted updates', () => {
    act(() => {
      root.render(<Harness />);
    });

    act(() => {
      usePresenceWantedStore.getState().setWanted('chat-list:all', ['u1']);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(subscribePresence).toHaveBeenCalledWith(['u1']);
    const callsAfterFirst = subscribePresence.mock.calls.length;

    act(() => {
      usePresenceWantedStore.getState().setWanted('chat-list:all', ['u1']);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(subscribePresence.mock.calls.length).toBe(callsAfterFirst);
  });

  it('subscribes when wanted ids change after empty start', () => {
    act(() => {
      root.render(<Harness />);
    });
    expect(subscribePresence).toHaveBeenCalledWith([]);

    act(() => {
      usePresenceWantedStore.getState().setWanted('player-card', ['u2']);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(subscribePresence).toHaveBeenCalledWith(['u2']);
  });

  it('pushes empty subscription when all wants clear', () => {
    act(() => {
      root.render(<Harness />);
    });

    act(() => {
      usePresenceWantedStore.getState().setWanted('player-card', ['u2']);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    subscribePresence.mockClear();

    act(() => {
      usePresenceWantedStore.getState().clearWanted('player-card');
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(subscribePresence).toHaveBeenCalledWith([]);
  });
});
