// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayIntentInvalidation } from '@shared/playIntentRealtime';
import { useAuthStore } from '@/store/authStore';
import { usePlayIntentPool } from './usePlayIntent';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let invalidationHandler:
  | ((event: PlayIntentInvalidation) => void)
  | undefined;
let connectHandler: (() => void) | undefined;
const unsubscribePool = vi.fn();
const unsubscribeConnect = vi.fn();
const subscribePlayIntentPool = vi.fn((_cityId: string) => unsubscribePool);
const onConnect = vi.fn((callback: () => void) => {
  connectHandler = callback;
  return unsubscribeConnect;
});
const on = vi.fn(
  (
    event: string,
    callback: (payload: PlayIntentInvalidation) => void,
  ) => {
    if (event === 'play-intent:invalidate') invalidationHandler = callback;
  },
);
const off = vi.fn(
  (
    _event: string,
    _callback: (payload: PlayIntentInvalidation) => void,
  ) => undefined,
);

vi.mock('@/services/socketService', () => ({
  socketService: {
    subscribePlayIntentPool: (cityId: string) =>
      subscribePlayIntentPool(cityId),
    onConnect: (callback: () => void) => onConnect(callback),
    on: (
      event: string,
      callback: (payload: PlayIntentInvalidation) => void,
    ) => on(event, callback),
    off: (
      event: string,
      callback: (payload: PlayIntentInvalidation) => void,
    ) => off(event, callback),
  },
}));

const getPool = vi.fn(async (_input?: unknown) => ({
  intents: [],
  myIntent: null,
  pendingProposal: null,
}));

vi.mock('@/api/playIntents', () => ({
  playIntentsApi: {
    getPool: (...args: unknown[]) => getPool(...args),
  },
}));

function Harness() {
  usePlayIntentPool('  city-1  ', 'PADEL');
  return null;
}

function event(
  overrides: Partial<PlayIntentInvalidation> = {},
): PlayIntentInvalidation {
  return {
    version: 1,
    reason: 'intent-status-changed',
    cityId: 'city-1',
    sport: 'PADEL',
    entityType: 'GAME',
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('usePlayIntentPool realtime reconciliation', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    invalidationHandler = undefined;
    connectHandler = undefined;
    unsubscribePool.mockClear();
    unsubscribeConnect.mockClear();
    subscribePlayIntentPool.mockClear();
    onConnect.mockClear();
    on.mockClear();
    off.mockClear();
    getPool.mockClear();
    useAuthStore.setState({ user: { id: 'user-1' } as never });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    queryClient.clear();
    container.remove();
    vi.useRealTimers();
  });

  it('coalesces matching events, reconciles on reconnect, and cleans up', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    act(() => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });

    expect(subscribePlayIntentPool).toHaveBeenCalledWith('city-1');
    expect(getPool).toHaveBeenCalledWith({
      cityId: 'city-1',
      sport: 'PADEL',
    });
    expect(invalidationHandler).toBeTypeOf('function');
    expect(connectHandler).toBeTypeOf('function');

    act(() => {
      invalidationHandler?.(event());
      invalidationHandler?.(event({ intentId: 'intent-2' }));
      vi.advanceTimersByTime(74);
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenLastCalledWith({
      queryKey: ['play-intents', 'pool', 'city-1'],
    });

    invalidate.mockClear();
    act(() => {
      invalidationHandler?.(event({ cityId: 'other-city' }));
      invalidationHandler?.(event({ version: 2 as never }));
      vi.advanceTimersByTime(75);
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      connectHandler?.();
      vi.advanceTimersByTime(75);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = null;
    expect(unsubscribePool).toHaveBeenCalledTimes(1);
    expect(unsubscribeConnect).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith(
      'play-intent:invalidate',
      invalidationHandler,
    );
  });
});
