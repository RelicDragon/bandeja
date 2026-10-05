// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { BottomTabBar } from './BottomTabBar';

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: null as Record<string, unknown> | null })) };
});
vi.mock('@/hooks/useUnreadBridge', () => ({ useBottomTabUnreadBadges: () => ({ chats: 0 }) }));
vi.mock('@/hooks/useDesktop', () => ({ useDesktop: () => false }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/components/clubAdmin/ClubAdminFab', () => ({ ClubAdminFab: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const setUser = (fields: Record<string, unknown>) =>
  act(() => useAuthStore.setState({ user: { id: 'u1', sportsEnabled: ['PADEL'], ...fields } }));
const tabLabels = () =>
  [...host.querySelectorAll('[role="navigation"] button')].map((el) => el.getAttribute('aria-label'));

it('shows only the tabs the novice rank has revealed, and none for a Newcomer', () => {
  setUser({ noviceRank: 0, noviceCountedGames: 0, noviceUnlockedAllAt: null });
  act(() => root.render(<MemoryRouter initialEntries={['/find']}><BottomTabBar /></MemoryRouter>));
  expect(host.querySelector('[role="navigation"]')).toBeNull();

  setUser({ noviceRank: 1, noviceCountedGames: 1, noviceUnlockedAllAt: null });
  expect(tabLabels()).toEqual(['My', 'Find']);

  setUser({ noviceRank: 3, noviceCountedGames: 3, noviceUnlockedAllAt: null });
  expect(tabLabels()).toEqual(['My', 'Find', 'Chats', 'Top']);

  setUser({ noviceRank: 3, noviceCountedGames: 3, noviceUnlockedAllAt: '2026-10-05T10:00:00.000Z' });
  expect(tabLabels()).toEqual(['My', 'Find', 'Chats', 'Market', 'Top']);
});

it('keeps every tab for a user payload without novice fields (existing players)', () => {
  setUser({});
  act(() => root.render(<MemoryRouter><BottomTabBar /></MemoryRouter>));
  expect(tabLabels()).toEqual(['My', 'Find', 'Chats', 'Market', 'Top']);
});
