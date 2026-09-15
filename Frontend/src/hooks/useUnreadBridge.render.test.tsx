// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUnreadStore } from '@/store/unreadStore';
import { useContextUnread, useGameUnreadPresenceForIds, useGameUnreadTotalForIds } from './useUnreadBridge';

vi.mock('@/store/unreadStore', async () => {
  const { create } = await import('zustand');
  type State = { fetchedAt: number; displayedByContext: Record<string, number> };
  return {
    useUnreadStore: create<State>(() => ({ fetchedAt: 0, displayedByContext: {} })),
    isUnreadStoreWarm: (s: State) => s.fetchedAt > 0,
    selectContextUnread: (type: string, id: string, s: State) => s.displayedByContext[`${type}:${id}`] ?? 0,
  };
});
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('@/store/playersStore', () => ({ usePlayersStore: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const listRender = vi.fn();
const ids = ['game'];
function List({ fallback }: { fallback: Record<string, number> }) {
  const presence = useGameUnreadPresenceForIds(ids, fallback);
  listRender(presence);
  return <span data-list>{presence.game ?? 0}</span>;
}
function Badge({ fallback }: { fallback: Record<string, number> }) {
  const total = useGameUnreadTotalForIds(ids, fallback);
  const card = useContextUnread('GAME', 'game', fallback.game ?? 0);
  return <span data-badge>{total}/{card}</span>;
}
function render(fallback = { game: 4 }) {
  act(() => root.render(<><List fallback={fallback} /><Badge fallback={fallback} /></>));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  root = createRoot(container);
  useUnreadStore.setState({ fetchedAt: 0, displayedByContext: {} });
  listRender.mockClear();
});
afterEach(() => act(() => root.unmount()));

it('updates exact badges without rerendering ordering for positive-to-positive counts', () => {
  useUnreadStore.setState({ fetchedAt: 1, displayedByContext: { 'GAME:game': 1 } });
  render();
  expect(listRender).toHaveBeenCalledTimes(1);
  act(() => useUnreadStore.setState({ displayedByContext: { 'GAME:game': 2, 'GAME:other': 9 } }));
  expect(container.querySelector('[data-badge]')?.textContent).toBe('2/2');
  expect(listRender).toHaveBeenCalledTimes(1);
  act(() => useUnreadStore.setState({ displayedByContext: { 'GAME:game': 0 } }));
  expect(container.querySelector('[data-list]')?.textContent).toBe('0');
  expect(container.querySelector('[data-badge]')?.textContent).toBe('0/0');
  expect(listRender).toHaveBeenCalledTimes(2);
});

it('uses the cold fallback and switches to the authoritative warm store including zero', () => {
  render();
  expect(container.querySelector('[data-list]')?.textContent).toBe('1');
  expect(container.querySelector('[data-badge]')?.textContent).toBe('4/4');
  act(() => useUnreadStore.setState({ fetchedAt: 1, displayedByContext: {} }));
  expect(container.querySelector('[data-list]')?.textContent).toBe('0');
  expect(container.querySelector('[data-badge]')?.textContent).toBe('0/0');
});
