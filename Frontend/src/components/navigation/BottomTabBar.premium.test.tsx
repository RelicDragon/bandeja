// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { BottomTabBar } from './BottomTabBar';

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: { isPremium: true, mainTheme: 'premium', sportsEnabled: ['PADEL'] } })) };
});
vi.mock('@/hooks/useUnreadBridge', () => ({ useBottomTabUnreadBadges: () => ({ chats: 3 }) }));
vi.mock('@/hooks/useDesktop', () => ({ useDesktop: () => false }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/components/clubAdmin/ClubAdminFab', () => ({ ClubAdminFab: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));

let host: HTMLDivElement;
let root: Root;
function CurrentRoute() {
  return <output>{useLocation().pathname}</output>;
}
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

it('preserves the original active-tab layout and unread counts with the Premium theme', () => {
  act(() => root.render(<MemoryRouter><BottomTabBar /><CurrentRoute /></MemoryRouter>));
  expect(host.querySelector('[role="navigation"]')?.classList.contains('premium-tab-bar')).toBe(true);
  expect([...host.querySelectorAll('.bottom-tab-label')].map((el) => el.textContent)).toEqual(['Find', 'Chats', 'Market', 'Top']);
  const chats = host.querySelector<HTMLButtonElement>('button[aria-label="Chats"]')!;
  expect(chats.textContent).toContain('3');
  act(() => chats.click());
  expect(host.querySelector('output')?.textContent).toBe('/chats');
  expect(chats.getAttribute('aria-current')).toBe('page');
  expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(chats.querySelector('.bottom-tab-label')).toBeNull();
  const premiumTabMarkup = chats.innerHTML;

  const user = useAuthStore.getState().user!;
  act(() => useAuthStore.setState({ user: { ...user, mainTheme: 'classic' } }));
  expect(host.querySelector('.premium-tab-bar')).toBeNull();
  expect(useAuthStore.getState().user?.isPremium).toBe(true);
  expect(chats.innerHTML).toBe(premiumTabMarkup);
  act(() => useAuthStore.setState({ user: { ...user, mainTheme: 'premium' } }));
  expect(host.querySelector('.premium-tab-bar')).not.toBeNull();

  // Membership still gates Premium regardless of the saved preference.
  act(() => useAuthStore.setState({ user: { ...user, isPremium: false } }));
  expect(host.querySelector('.premium-tab-bar')).toBeNull();
  expect(chats.innerHTML).toBe(premiumTabMarkup);
  expect(host.querySelector('button[aria-label="Chats"]')?.getAttribute('aria-current')).toBe('page');
  act(() => useAuthStore.setState({ user: { ...user, isPremium: true, sportsEnabled: [] } }));
  expect(host.querySelectorAll('.premium-tab')).toHaveLength(3);
  expect(host.querySelector('button[aria-label="My"]')).toBeNull();
  expect(host.querySelector('button[aria-label="Find"]')).toBeNull();
});
