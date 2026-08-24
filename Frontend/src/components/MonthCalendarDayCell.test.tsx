// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthCalendarDayCell } from './MonthCalendarDayCell';

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
  });
});
