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
import { MonthCalendarDayCell } from './MonthCalendarDayCell';

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const dayWeather = {
  stale: false,
  point: {
    time: '2026-08-23T12:00:00.000Z',
    temperatureC: 22,
    temperatureF: 72,
    weatherCode: 0,
    conditionKey: 'clear' as const,
    precipitationProbability: 0,
    precipitationMm: 0,
    windSpeedKmh: 8,
    relativeHumidity: 45,
    isDay: true,
  },
};

describe('MonthCalendarDayCell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useThemeStore.getState().setTheme('light');
  });

  it('renders entities and quiet weather on separate rows', () => {
    act(() => root.render(
      <MonthCalendarDayCell
        day={new Date(2026, 7, 23)}
        isCurrentMonth
        isSelected={false}
        isTodayDate={false}
        gameCount={2}
        unreadCount={0}
        hasGames
        showWeatherPill
        showTypePill
        showParticipantPill={false}
        typePillTypes={['GAME', 'TOURNAMENT']}
        participantTypes={[]}
        dayWeather={dayWeather}
        locale="en-GB"
        onSelect={vi.fn()}
      />,
    ));

    const entityRow = container.querySelector('[data-calendar-day-entities]');
    const weatherRow = container.querySelector('[data-calendar-day-weather]');

    expect(container.querySelector('[data-calendar-day-rule]')).not.toBeNull();
    expect(entityRow).not.toBeNull();
    expect(entityRow?.querySelectorAll('.rounded-full')).toHaveLength(2);
    expect(weatherRow).not.toBeNull();
    expect(weatherRow?.querySelector('svg')).not.toBeNull();
    expect(weatherRow?.textContent).toContain('22');
    expect(weatherRow?.querySelector<HTMLElement>('[data-calendar-weather-temperature]')?.style.color)
      .toBe('');
    expect(entityRow?.nextElementSibling).toBe(weatherRow);
  });

  it('keeps an empty entity row before weather when the day has no games', () => {
    act(() => root.render(
      <MonthCalendarDayCell
        day={new Date(2026, 7, 24)}
        isCurrentMonth
        isSelected={false}
        isTodayDate={false}
        gameCount={0}
        unreadCount={0}
        hasGames={false}
        showWeatherPill
        showTypePill={false}
        showParticipantPill={false}
        typePillTypes={[]}
        participantTypes={[]}
        dayWeather={dayWeather}
        locale="en-GB"
        onSelect={vi.fn()}
      />,
    ));

    const entityRow = container.querySelector('[data-calendar-day-entities]');
    const weatherRow = container.querySelector('[data-calendar-day-weather]');

    expect(entityRow).not.toBeNull();
    expect(entityRow?.textContent).toBe('');
    expect(entityRow?.nextElementSibling).toBe(weatherRow);
    expect(container.querySelector('[data-calendar-day-rule]')).not.toBeNull();
  });

  it('hides the date hairline when the day has no games and no forecast', () => {
    act(() => root.render(
      <MonthCalendarDayCell
        day={new Date(2026, 7, 3)}
        isCurrentMonth={false}
        isSelected={false}
        isTodayDate={false}
        gameCount={0}
        unreadCount={0}
        hasGames={false}
        showWeatherPill={false}
        showTypePill={false}
        showParticipantPill={false}
        typePillTypes={[]}
        participantTypes={[]}
        dayWeather={null}
        locale="en-GB"
        onSelect={vi.fn()}
      />,
    ));

    expect(container.querySelector('[data-calendar-day-rule]')).toBeNull();
    expect(container.querySelector('[data-calendar-day-entities]')).toBeNull();
    expect(container.querySelector('[data-calendar-day-weather]')).toBeNull();
    expect(container.querySelector('[data-calendar-day-ad-tags]')).toBeNull();
  });

  it('renders the ultra-small ad tag row at the bottom of the cell', () => {
    act(() => root.render(
      <MonthCalendarDayCell
        day={new Date(2026, 7, 3)}
        isCurrentMonth
        isSelected={false}
        isTodayDate={false}
        gameCount={0}
        unreadCount={0}
        hasGames={false}
        showWeatherPill={false}
        showTypePill={false}
        showParticipantPill={false}
        typePillTypes={[]}
        participantTypes={[]}
        dayWeather={null}
        locale="en-GB"
        calendarTags={[{ campaignId: 'campaign-a', label: 'CAMP', color: '#7C3AED' }]}
        onSelect={vi.fn()}
      />,
    ));

    const tag = container.querySelector('[data-calendar-day-ad-tag]');
    expect(tag).not.toBeNull();
    expect(tag?.textContent).toBe('CAMP');
    expect((tag as HTMLElement).style.color).toBe('rgb(124, 58, 237)');
    expect(tag?.parentElement?.classList.contains('absolute')).toBe(true);
    expect(tag?.parentElement?.classList.contains('bottom-1')).toBe(true);
    expect(tag?.parentElement?.classList.contains('flex-col')).toBe(true);
  });

  it('stacks two or more ad tags on separate rows', () => {
    act(() => root.render(
      <MonthCalendarDayCell
        day={new Date(2026, 9, 5)}
        isCurrentMonth
        isSelected={false}
        isTodayDate={false}
        gameCount={0}
        unreadCount={0}
        hasGames={false}
        showWeatherPill={false}
        showTypePill={false}
        showParticipantPill={false}
        typePillTypes={[]}
        participantTypes={[]}
        dayWeather={null}
        locale="en-GB"
        calendarTags={[
          { campaignId: 'campaign-a', label: 'CAMP', color: '#7C3AED' },
          { campaignId: 'campaign-b', label: 'LIGA', color: '#2563EB' },
        ]}
        onSelect={vi.fn()}
      />,
    ));

    const tags = container.querySelector('[data-calendar-day-ad-tags]');
    const labels = [...container.querySelectorAll('[data-calendar-day-ad-tag]')];
    expect(labels.map((el) => el.textContent)).toEqual(['CAMP', 'LIGA']);
    expect(tags?.textContent).not.toContain('·');
    expect(labels.every((el) => el.parentElement === tags)).toBe(true);
    expect(tags?.classList.contains('flex-col')).toBe(true);
    expect(container.querySelector('button')?.style.paddingBottom).toBe('21px');
  });

  it('lifts CAMP purple so it stays readable on dark cells', () => {
    useThemeStore.getState().setTheme('dark');
    act(() => root.render(
      <MonthCalendarDayCell
        day={new Date(2026, 9, 1)}
        isCurrentMonth
        isSelected={false}
        isTodayDate={false}
        gameCount={0}
        unreadCount={0}
        hasGames={false}
        showWeatherPill={false}
        showTypePill={false}
        showParticipantPill={false}
        typePillTypes={[]}
        participantTypes={[]}
        dayWeather={null}
        locale="en-GB"
        calendarTags={[{ campaignId: 'campaign-a', label: 'CAMP', color: '#7C3AED' }]}
        onSelect={vi.fn()}
      />,
    ));

    const tag = container.querySelector('[data-calendar-day-ad-tag]') as HTMLElement | null;
    expect(tag?.style.color).toBe(hexToRgb(calendarTagReadableColor('#7C3AED', 'dark')));
    expect(tag?.style.color).not.toBe('rgb(124, 58, 237)');
  });
});
