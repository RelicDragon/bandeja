// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePremiumNavigationAppearance } from './usePremiumNavigationAppearance';

vi.mock('@/store/themeStore', () => ({ useResolvedAppAppearance: () => 'light' }));

function Appearance({ premium }: { premium: boolean }) {
  usePremiumNavigationAppearance(premium);
  return null;
}

it('keeps dark status chrome while another Premium header remains mounted', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.createElement('div'));
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#f9fafb';
  document.head.append(meta);
  try {
    act(() => root.render(<><Appearance key="shell" premium /><Appearance key="thread" premium /></>));
    act(() => root.render(<Appearance key="shell" premium />));
    expect(document.documentElement.classList.contains('premium-navigation')).toBe(true);
    expect(meta.content).toBe('#11100e');
    act(() => root.unmount());
    expect(document.documentElement.classList.contains('premium-navigation')).toBe(false);
    expect(meta.content).toBe('#f9fafb');
  } finally {
    act(() => root.unmount());
    document.documentElement.classList.remove('premium-navigation');
    meta.remove();
  }
});

it('changes only navigation appearance and restores system chrome after downgrade or unmount', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#f9fafb';
  document.head.append(meta);
  try {
    act(() => root.render(<Appearance premium />));
    expect(document.documentElement.classList.contains('premium-navigation')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(meta.content).toBe('#11100e');
    act(() => root.render(<Appearance premium={false} />));
    expect(document.documentElement.classList.contains('premium-navigation')).toBe(false);
    expect(meta.content).toBe('#f9fafb');
    document.documentElement.classList.add('dark');
    act(() => root.render(<Appearance premium />));
    act(() => root.unmount());
    expect(document.documentElement.classList.contains('premium-navigation')).toBe(false);
    expect(meta.content).toBe('#111827');
  } finally {
    act(() => root.unmount());
    document.documentElement.classList.remove('dark', 'premium-navigation');
    meta.remove();
  }
});
