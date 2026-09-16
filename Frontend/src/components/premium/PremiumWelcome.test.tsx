// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PremiumWelcome } from './PremiumWelcome';
import { PremiumBrand } from '@/components/navigation/PremiumBrand';
import { useAuthStore } from '@/store/authStore';
import { usePremiumWelcomeStore } from '@/store/premiumWelcomeStore';
import { usersApi } from '@/api/users';
import { useReducedMotion } from 'framer-motion';

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create((set) => ({
    user: null, isInitializing: false, isAuthenticated: true,
    updateUser: (user: unknown) => set({ user }),
  })) };
});
vi.mock('@/api/users', () => ({ usersApi: {
  getPremiumOnboarding: vi.fn(), completePremiumOnboarding: vi.fn(),
} }));
vi.mock('framer-motion', () => ({ useReducedMotion: vi.fn(() => false) }));
vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root;
let host: HTMLDivElement;
const member = { id: 'premium-user', isPremium: true, mainTheme: 'classic' as const };
const completed = '2026-09-16T16:00:00.000Z';
const render = async (online = true) => {
  await act(async () => root.render(<><PremiumBrand /><PremiumWelcome online={online} /></>));
};
const loadPoster = () => act(async () => {
  document.querySelector('.premium-welcome-art')!.dispatchEvent(new Event('load'));
});
const openDoors = () => act(async () => {
  // React uses the prefixed event in JSDOM, which has no AnimationEvent constructor.
  for (const name of ['animationend', 'webkitAnimationEnd']) {
    const event = new Event(name, { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'premium-welcome-open-right' });
    document.querySelector('.premium-welcome-door-right')!.dispatchEvent(event);
  }
});
const acceptWelcome = async () => {
  await loadPoster();
  await openDoors();
  await act(async () => document.querySelector<HTMLButtonElement>('.premium-welcome-accept')!.click());
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.mocked(useReducedMotion).mockReturnValue(false);
  useAuthStore.setState({ user: member, isInitializing: false, isAuthenticated: true });
  usePremiumWelcomeStore.getState().close();
  vi.mocked(usersApi.getPremiumOnboarding).mockResolvedValue({ success: true, data: { isPremium: true, premiumOnboardingCompletedAt: null } });
  vi.mocked(usersApi.completePremiumOnboarding).mockResolvedValue({ success: true, data: { isPremium: true, premiumOnboardingCompletedAt: completed, mainTheme: 'premium' } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  host.remove();
});
it('verifies the server even with cached completion and opens for Premium in Classic theme', async () => {
  useAuthStore.setState({ user: { ...member, premiumOnboardingCompletedAt: completed } });
  await render();
  expect(usersApi.getPremiumOnboarding).toHaveBeenCalledOnce();
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  expect(usersApi.completePremiumOnboarding).not.toHaveBeenCalled();
  await acceptWelcome();
  expect(usersApi.completePremiumOnboarding).toHaveBeenCalledOnce();
  expect(useAuthStore.getState().user?.premiumOnboardingCompletedAt).toBe(completed);
  expect(useAuthStore.getState().user?.mainTheme).toBe('premium');
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('stays hidden after saved dismissal, but the header replays without navigation or another write', async () => {
  vi.mocked(usersApi.getPremiumOnboarding).mockResolvedValue({ success: true, data: { isPremium: true, premiumOnboardingCompletedAt: completed } });
  await render();
  expect(document.querySelector('[role=dialog]')).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('.premium-brand')!.click());
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  await acceptWelcome();
  expect(usersApi.completePremiumOnboarding).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.mainTheme).toBe('classic');
});
it('closes despite a failed save and stays dismissed on reconnect', async () => {
  vi.useFakeTimers();
  vi.mocked(usersApi.completePremiumOnboarding).mockRejectedValueOnce(new Error('offline'));
  await render();
  await acceptWelcome();
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(document.querySelector('[role=alert]')).toBeNull();
  expect(useAuthStore.getState().user?.premiumOnboardingCompletedAt).toBeNull();
  expect(useAuthStore.getState().user?.mainTheme).toBe('premium');
  await act(async () => vi.advanceTimersByTime(400));
  await render(false);
  await render(true);
  expect(usersApi.completePremiumOnboarding).toHaveBeenCalledOnce();
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('closes immediately without waiting for the save response', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof usersApi.completePremiumOnboarding>>) => void;
  vi.mocked(usersApi.completePremiumOnboarding).mockReturnValue(new Promise((done) => { resolve = done; }));
  await render();
  await acceptWelcome();
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(useAuthStore.getState().user?.premiumOnboardingCompletedAt).toBeNull();
  expect(useAuthStore.getState().user?.mainTheme).toBe('premium');
  await act(async () => resolve({ success: true, data: { isPremium: true, premiumOnboardingCompletedAt: completed, mainTheme: 'premium' } }));
  expect(useAuthStore.getState().user?.premiumOnboardingCompletedAt).toBe(completed);
  expect(useAuthStore.getState().user?.mainTheme).toBe('premium');
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('never opens for standard users or while auth initializes', async () => {
  useAuthStore.setState({ user: { ...member, isPremium: false } });
  await render();
  expect(usersApi.getPremiumOnboarding).not.toHaveBeenCalled();
  useAuthStore.setState({ user: member, isInitializing: true });
  await render();
  expect(usersApi.getPremiumOnboarding).not.toHaveBeenCalled();
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('discards an old account response after switching users', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof usersApi.getPremiumOnboarding>>) => void;
  vi.mocked(usersApi.getPremiumOnboarding).mockReturnValue(new Promise((done) => { resolve = done; }));
  await render();
  await act(async () => useAuthStore.setState({ user: { ...member, id: 'standard-user', isPremium: false } }));
  await act(async () => resolve({ success: true, data: { isPremium: true, premiumOnboardingCompletedAt: null } }));
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(useAuthStore.getState().user?.id).toBe('standard-user');
});

it('does not let a slow startup check overwrite a newer dismissal', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof usersApi.getPremiumOnboarding>>) => void;
  vi.mocked(usersApi.getPremiumOnboarding).mockReturnValue(new Promise((done) => { resolve = done; }));
  await render();
  await act(async () => host.querySelector<HTMLButtonElement>('.premium-brand')!.click());
  await acceptWelcome();
  await act(async () => resolve({ success: true, data: { isPremium: true, premiumOnboardingCompletedAt: null } }));
  expect(useAuthStore.getState().user?.premiumOnboardingCompletedAt).toBe(completed);
  expect(useAuthStore.getState().user?.mainTheme).toBe('premium');
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('offers acceptance when the doors open, before the poster finishes settling', async () => {
  await render();
  expect(document.querySelector('.premium-welcome-accept')).toBeNull();
  await loadPoster();
  expect(document.querySelector('.premium-welcome-accept')).toBeNull();
  await openDoors();
  expect(document.querySelector('.premium-welcome-accept')?.textContent).toContain('common.premiumWelcomeAccept');
  expect(usersApi.completePremiumOnboarding).not.toHaveBeenCalled();
});

it('offers acceptance without waiting for animation when reduced motion is enabled', async () => {
  vi.mocked(useReducedMotion).mockReturnValue(true);
  await render();
  await loadPoster();
  expect(document.querySelector('.premium-welcome-accept')).not.toBeNull();
});

it('offers acceptance if the poster cannot load', async () => {
  await render();
  await act(async () => document.querySelector('.premium-welcome-art')!.dispatchEvent(new Event('error')));
  expect(document.querySelector('.premium-welcome-accept')).not.toBeNull();
});
