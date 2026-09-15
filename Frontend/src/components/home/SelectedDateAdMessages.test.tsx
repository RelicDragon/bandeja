// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
});
import { useThemeStore } from '@/store/themeStore';
import { calendarTagReadableColor } from '@/utils/calendarTagReadableColor';
import { SelectedDateAdMessages } from './SelectedDateAdMessages';

const { getTagsForDay } = vi.hoisted(() => ({
  getTagsForDay: vi.fn(),
}));

vi.mock('@/hooks/useAdCalendarTags', () => ({
  useAdCalendarTags: () => ({ getTagsForDay }),
}));

describe('SelectedDateAdMessages', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    getTagsForDay.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useThemeStore.getState().setTheme('light');
  });

  it('shows localized campaign text for the selected tagged day', () => {
    getTagsForDay.mockReturnValue([{
      campaignId: 'campaign-a',
      label: 'CAMP',
      color: '#7C3AED',
      message: 'Описание кэмпа',
    }]);

    act(() => root.render(<SelectedDateAdMessages date={new Date(2026, 9, 3)} />));

    expect(getTagsForDay).toHaveBeenCalledWith('2026-10-03');
    expect(container.querySelector('[data-selected-date-ad-messages]')?.textContent)
      .toContain('Описание кэмпа');
    expect(container.querySelector('[data-selected-date-ad-label]')?.textContent).toBe('CAMP');
  });

  it('stays hidden when the selected day has no localized campaign text', () => {
    getTagsForDay.mockReturnValue([{
      campaignId: 'campaign-a',
      label: 'CAMP',
      color: '#7C3AED',
      message: null,
    }]);

    act(() => root.render(<SelectedDateAdMessages date={new Date(2026, 9, 8)} />));

    expect(container.querySelector('[data-selected-date-ad-messages]')).toBeNull();
  });

  it('lifts CAMP purple on the selected-day label in dark appearance', () => {
    useThemeStore.getState().setTheme('dark');
    getTagsForDay.mockReturnValue([{
      campaignId: 'campaign-a',
      label: 'CAMP',
      color: '#7C3AED',
      message: 'Montenegro Padel Camp 2026',
    }]);

    act(() => root.render(<SelectedDateAdMessages date={new Date(2026, 9, 1)} />));

    const label = container.querySelector('[data-selected-date-ad-label]') as HTMLElement | null;
    const lifted = calendarTagReadableColor('#7C3AED', 'dark');
    const n = Number.parseInt(lifted.slice(1), 16);
    expect(label?.style.color).toBe(`rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`);
    expect(label?.style.color).not.toBe('rgb(124, 58, 237)');
  });
});
