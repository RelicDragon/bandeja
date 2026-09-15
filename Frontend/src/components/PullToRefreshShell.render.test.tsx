// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PullToRefreshShell } from './PullToRefreshShell';

const gesture = vi.hoisted(() => ({
  state: { isRefreshing: false, pullDistance: 0, pullProgress: 0 },
  listeners: new Set<() => void>(),
}));
vi.mock('@/hooks/usePullToRefresh', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePullToRefresh: () => useSyncExternalStore(
      (listener) => { gesture.listeners.add(listener); return () => gesture.listeners.delete(listener); },
      () => gesture.state,
    ),
  };
});
vi.mock('@/components/RefreshIndicator', () => ({ RefreshIndicator: () => null }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  gesture.state = { isRefreshing: false, pullDistance: 0, pullProgress: 0 };
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

it('moves the shell without rerendering content, but propagates refresh and parent changes', () => {
  const content = vi.fn(({ isRefreshing }: { isRefreshing: boolean }) => <span>{isRefreshing ? 'refreshing' : 'ready'}</span>);
  const onRefresh = vi.fn(async () => {});
  act(() => root.render(<PullToRefreshShell onRefresh={onRefresh}>{content}</PullToRefreshShell>));
  expect(content).toHaveBeenCalledTimes(1);
  for (const distance of [10, 25, 50]) {
    act(() => {
      gesture.state = { ...gesture.state, pullDistance: distance, pullProgress: distance / 80 };
      gesture.listeners.forEach((listener) => listener());
    });
  }
  expect(container.firstElementChild?.getAttribute('style')).toContain('translateY(50px)');
  expect(content).toHaveBeenCalledTimes(1);
  act(() => {
    gesture.state = { ...gesture.state, isRefreshing: true };
    gesture.listeners.forEach((listener) => listener());
  });
  expect(content).toHaveBeenCalledTimes(2);
  expect(container.textContent).toBe('refreshing');
  act(() => root.render(<PullToRefreshShell onRefresh={onRefresh}>{() => <span>new games</span>}</PullToRefreshShell>));
  expect(container.textContent).toBe('new games');
});
