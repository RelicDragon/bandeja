// @vitest-environment jsdom
import { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Game } from '@/types';
import { useMyGames } from './useMyGames';

const query = vi.hoisted(() => ({
  data: { games: [] as Game[], invites: [], unreadCounts: {} },
  isPending: false,
  refetch: vi.fn(),
}));
vi.mock('@/queries/games/useMyGamesQuery', () => ({ useMyGamesQuery: () => query }));
vi.mock('@/api/me', () => ({ clearMyTabCache: vi.fn() }));

let root: Root;
let client: QueryClient;
let latest: ReturnType<typeof useMyGames>;
const derive = vi.fn((games: Game[]) => games.map((game) => game.id));
const onLoading = vi.fn();
function Probe({ userId }: { userId: string }) {
  const result = useMyGames({ id: userId }, onLoading);
  latest = result;
  const ids = useMemo(() => derive(result.games), [result.games]);
  return <span>{ids.join(',')}</span>;
}
function render(userId = 'viewer') {
  act(() => root.render(<QueryClientProvider client={client}><Probe userId={userId} /></QueryClientProvider>));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement('div'));
  client = new QueryClient();
  derive.mockClear();
  query.data = { games: [
    { id: 'open', entityType: 'GAME', participants: [] } as unknown as Game,
    { id: 'event', entityType: 'EVENT', participants: [{ userId: 'viewer', status: 'PLAYING' }] } as Game,
  ], invites: [], unreadCounts: {} };
});
afterEach(() => { act(() => root.unmount()); client.clear(); });

it('preserves derived games across parent and unread-only updates', () => {
  render();
  const initialGames = latest.games;
  render();
  query.data = { ...query.data, unreadCounts: { open: 2 } };
  render();
  expect(latest.games).toBe(initialGames);
  expect(derive).toHaveBeenCalledTimes(1);
});

it('recomputes membership when source games or viewer change', () => {
  render();
  expect(latest.games.map((game) => game.id)).toEqual(['open', 'event']);
  render('other');
  expect(latest.games.map((game) => game.id)).toEqual(['open']);
  query.data = { ...query.data, games: [] };
  render('other');
  expect(latest.games).toEqual([]);
  expect(derive).toHaveBeenCalledTimes(3);
});
