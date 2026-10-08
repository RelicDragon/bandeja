// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: null as Record<string, unknown> | null })) };
});

import { useAuthStore } from '@/store/authStore';
import { NoviceCelebrationBurst } from '@/components/novice/celebration/NoviceCelebrationBurst';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { ChatListPullIndicator } from '@/components/chat/ChatListPullIndicator';

const setUser = (user: Record<string, unknown> | null) =>
  act(() => {
    (useAuthStore as unknown as { setState: (s: unknown) => void }).setState({ user });
  });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setUser(null);
});

const render = (node: React.ReactNode) => act(() => root.render(node));
const q = (sel: string) => host.querySelector(sel);

describe('celebration hook-in', () => {
  it('Classic keeps the original burst', () => {
    setUser({ id: 'u', isPremium: true, mainTheme: 'classic' });
    render(<NoviceCelebrationBurst reduceMotion={false} />);
    expect(q('[data-testid="member-celebration"]')).toBeNull();
    expect(host.querySelectorAll('span').length).toBeGreaterThan(0);
  });

  it('a lapsed member with a saved theme keeps the original burst', () => {
    setUser({ id: 'u', isPremium: false, mainTheme: 'nordic' });
    render(<NoviceCelebrationBurst reduceMotion={false} />);
    expect(q('[data-testid="member-celebration"]')).toBeNull();
  });

  it.each(['spring', 'nordic', 'cyberpunk'] as const)('%s members get the themed burst', (theme) => {
    setUser({ id: 'u', isPremium: true, mainTheme: theme });
    render(<NoviceCelebrationBurst reduceMotion={false} />);
    const burst = q('[data-testid="member-celebration"]');
    expect(burst?.getAttribute('data-member-effect')).toBe(theme);
    const particles = burst?.querySelectorAll('.mfx-particle') ?? [];
    expect(particles.length).toBeGreaterThan(0);
    expect(particles.length).toBeLessThanOrEqual(40);
  });

  it('reduced motion shows one static glyph for members', () => {
    setUser({ id: 'u', isPremium: true, mainTheme: 'ocean' });
    render(<NoviceCelebrationBurst reduceMotion />);
    expect(q('[data-reduced-motion="true"]')).not.toBeNull();
    expect(host.querySelectorAll('.mfx-particle')).toHaveLength(0);
    expect(host.querySelectorAll('.mfx-static-glyph')).toHaveLength(1);
  });
});

describe('pull-to-refresh hook-in', () => {
  it('Classic keeps the blue arrow and Loader2', () => {
    render(<RefreshIndicator isRefreshing={false} pullDistance={40} pullProgress={0.5} />);
    expect(q('[data-testid="member-spinner"]')).toBeNull();
  });

  it('members get the themed glyph posed to the pull, then turning', () => {
    setUser({ id: 'u', isPremium: true, mainTheme: 'steampunk' });
    render(<RefreshIndicator isRefreshing={false} pullDistance={40} pullProgress={0.5} />);
    let spinner = q('[data-testid="member-spinner"]') as SVGElement | null;
    expect(spinner?.getAttribute('data-spinner')).toBe('gear');
    expect(spinner?.getAttribute('data-state')).toBe('pull');
    expect(spinner?.style.getPropertyValue('--mfx-p')).toBe('0.5');

    render(<RefreshIndicator isRefreshing pullDistance={40} pullProgress={1} />);
    spinner = q('[data-testid="member-spinner"]') as SVGElement | null;
    expect(spinner?.getAttribute('data-state')).toBe('spin');
  });

  it('the chat inbox indicator reads the pull from its CSS variable', () => {
    setUser({ id: 'u', isPremium: true, mainTheme: 'alpine' });
    render(<ChatListPullIndicator isRefreshing={false} />);
    const spinner = q('[data-testid="member-spinner"]') as SVGElement | null;
    expect(spinner?.getAttribute('data-spinner')).toBe('alpineSunrise');
    expect(spinner?.style.getPropertyValue('--mfx-p')).toBe('var(--chat-pull-progress, 0)');
  });
});
