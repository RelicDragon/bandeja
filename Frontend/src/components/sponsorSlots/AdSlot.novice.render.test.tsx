// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { AdSlot } from './AdSlot';

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: null as Record<string, unknown> | null })) };
});
vi.mock('@/utils/networkStatus', async () => {
  const { create } = await import('zustand');
  return { useNetworkStore: create(() => ({ isOnline: true })) };
});
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/hooks/useAdPlacements', () => ({
  enqueueAdEvent: vi.fn(),
  useAdPlacementEventMeta: () => ({}),
  useAdPlacements: () => ({
    placements: { HOME_HERO: { campaignId: 'c1', creativeId: 'cr1' } },
    dismissPlacement: vi.fn(),
  }),
}));
vi.mock('@/components', () => ({ ConfirmationModal: () => null }));
vi.mock('./AdCard', () => ({ AdCard: () => <div data-testid="ad-card" /> }));
vi.mock('./useAdViewability', () => ({ useAdViewability: () => () => {} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

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

const renderSlot = (user: Record<string, unknown>) => {
  act(() => useAuthStore.setState({ user: { id: 'u1', ...user } }));
  act(() => root.render(<MemoryRouter><AdSlot placement={'HOME_HERO' as never} /></MemoryRouter>));
};

it('renders nothing while novice mode is on, at every novice rank', () => {
  for (const rank of [0, 1, 2, 3, 4]) {
    renderSlot({ noviceRank: rank, noviceUnlockedAllAt: null });
    expect(host.querySelector('[data-testid="ad-card"]')).toBeNull();
  }
});

it('renders the ad for Regulars, unlock-all users and payloads without novice fields', () => {
  renderSlot({ noviceRank: 5, noviceUnlockedAllAt: null });
  expect(host.querySelector('[data-testid="ad-card"]')).not.toBeNull();
  renderSlot({ noviceRank: 1, noviceUnlockedAllAt: '2026-10-05T10:00:00.000Z' });
  expect(host.querySelector('[data-testid="ad-card"]')).not.toBeNull();
  renderSlot({});
  expect(host.querySelector('[data-testid="ad-card"]')).not.toBeNull();
});
