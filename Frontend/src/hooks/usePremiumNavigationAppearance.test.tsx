// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MemberThemeId } from '@/utils/mainTheme';
import { usePremiumNavigationAppearance } from './usePremiumNavigationAppearance';

const appearance = vi.hoisted(() => ({ value: 'light' as 'light' | 'dark' }));
vi.mock('@/store/themeStore', () => ({ useResolvedAppAppearance: () => appearance.value }));

function Appearance({ theme }: { theme: MemberThemeId | null }) {
  usePremiumNavigationAppearance(theme);
  return null;
}

let meta: HTMLMetaElement;
const root = document.documentElement;
function applyRootTheme(theme: MemberThemeId | null) {
  root.classList.toggle('premium-theme', theme !== null);
  if (theme) root.dataset.memberTheme = theme;
  else delete root.dataset.memberTheme;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  appearance.value = 'light';
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#f9fafb';
  document.head.append(meta);
});
afterEach(() => {
  meta.remove();
  root.classList.remove('dark', 'premium-navigation');
  applyRootTheme(null);
});

it('keeps dark status chrome while another Premium header remains mounted', () => {
  applyRootTheme('premium');
  const r = createRoot(document.createElement('div'));
  act(() => r.render(<><Appearance key="shell" theme="premium" /><Appearance key="thread" theme="premium" /></>));
  act(() => r.render(<Appearance key="shell" theme="premium" />));
  expect(root.classList.contains('premium-navigation')).toBe(true);
  expect(meta.content).toBe('#11100e');
  act(() => r.unmount());
  expect(root.classList.contains('premium-navigation')).toBe(false);
  expect(meta.content).toBe('#faf9f6');
});

it('changes only navigation appearance and restores system chrome after downgrade or unmount', () => {
  applyRootTheme('premium');
  const r = createRoot(document.createElement('div'));
  act(() => r.render(<Appearance theme="premium" />));
  expect(root.classList.contains('premium-navigation')).toBe(true);
  expect(root.classList.contains('dark')).toBe(false);
  expect(meta.content).toBe('#11100e');
  applyRootTheme(null);
  act(() => r.render(<Appearance theme={null} />));
  expect(root.classList.contains('premium-navigation')).toBe(false);
  expect(meta.content).toBe('#f9fafb');
  root.classList.add('dark');
  act(() => r.render(<Appearance theme="premium" />));
  act(() => r.unmount());
  expect(root.classList.contains('premium-navigation')).toBe(false);
  expect(meta.content).toBe('#111827');
});

it('leaves the status bar dark-on-light for a light chrome and switches with the appearance', () => {
  applyRootTheme('spring');
  const r = createRoot(document.createElement('div'));
  act(() => r.render(<Appearance theme="spring" />));
  expect(root.classList.contains('premium-navigation')).toBe(false);
  const lightChrome = meta.content;
  expect(lightChrome).not.toBe('#f9fafb');

  appearance.value = 'dark';
  root.classList.add('dark');
  act(() => r.render(<Appearance theme="spring" />));
  expect(root.classList.contains('premium-navigation')).toBe(true);
  expect(meta.content).not.toBe(lightChrome);
  act(() => r.unmount());
  expect(root.classList.contains('premium-navigation')).toBe(false);
});
