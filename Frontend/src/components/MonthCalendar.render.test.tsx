// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Game, WeatherDay } from '@/types';
import { useUnreadStore } from '@/store/unreadStore';
import { useResolvedAppAppearance } from '@/store/themeStore';
import { aggregateFindGamesByDay } from '@/utils/findFilter';
import { aggregateFindDayIndexByDay, type FindDayIndexRow } from '@/utils/findDayIndexCounts';
import { weatherDayQueryOptions } from '@/queries/weather';
import { MonthCalendar } from './MonthCalendar';

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: {
    id: 'viewer', language: 'en-GB', weekStart: 'monday', gender: 'MALE',
    currentCity: { id: 'city', timezone: 'UTC' }, blockedUserIds: [],
  } })) };
});
vi.mock('@/store/unreadStore', async () => {
  const { create } = await import('zustand');
  return { useUnreadStore: create(() => ({ displayedByContext: {} })) };
});
vi.mock('@/store/themeStore', () => ({ useResolvedAppAppearance: vi.fn(() => 'light') }));
vi.mock('@/api/weather', () => ({ weatherApi: { getDay: vi.fn(), getPreview: vi.fn(async () => ({ available: false, hours: [] })) } }));
vi.mock('@/hooks/useAdCalendarTags', () => {
  const getTagsForDay = () => [];
  return { useAdCalendarTags: () => ({ getTagsForDay }) };
});
vi.mock('@/i18n/config', () => ({ default: { language: 'en', t: (key: string) => key } }));
vi.mock('react-i18next', () => {
  const state = { t: (key: string) => key, i18n: { language: 'en' } };
  return { useTranslation: () => state };
});
vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');
  const element = (tag: string) => ({ children, className, style, ref, onClick, ...props }: {
    children?: ReactNode; className?: string; style?: object; ref?: unknown; onClick?: () => void;
  }) => createElement(tag, {
    className, style, ref, onClick,
    ...Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('aria-'))),
  }, children);
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    useReducedMotion: () => true,
    motion: { div: element('div'), h3: element('h3'), button: element('button'), span: element('span') },
  };
});
vi.mock('@/utils/findFilter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/findFilter')>();
  return { ...actual, aggregateFindGamesByDay: vi.fn(actual.aggregateFindGamesByDay) };
});
vi.mock('@/utils/findDayIndexCounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/findDayIndexCounts')>();
  return { ...actual, aggregateFindDayIndexByDay: vi.fn(actual.aggregateFindDayIndexByDay) };
});

const games = [{
  id: 'game', entityType: 'GAME', sport: 'PADEL', gameType: 'CLASSIC', status: 'ANNOUNCED',
  startTime: '2026-09-15T18:00:00Z', endTime: '2026-09-15T19:30:00Z',
  timeIsSet: true, maxParticipants: 4, minLevel: 1, maxLevel: 7, isPublic: true,
  genderTeams: 'ANY', affectsRating: true, participants: [],
}] as Game[];
const index: FindDayIndexRow[] = [{
  id: 'game', startTime: games[0].startTime, dateKey: '2026-09-15', entityType: 'GAME',
  sport: 'PADEL', minLevel: 1, maxLevel: 7, maxParticipants: 4, genderTeams: 'ANY',
  trainerId: null, clubId: null, isPublic: true, timeIsSet: true, ownerUserId: 'owner',
}];
const emptyGames: Game[] = [];
const onDateSelect = vi.fn();
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  localStorage.setItem('padelpulse-calendar-weather-mode-find', '0');
  container = document.createElement('div');
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useUnreadStore.setState({ displayedByContext: {} });
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.useRealTimers();
  localStorage.clear();
});

it.each(['cards', 'index'] as const)('reuses %s aggregation and only renders changed calendar cells', (source) => {
  const render = (day: number) => act(() => root.render(
    <QueryClientProvider client={client}>
      <MonthCalendar selectedDate={new Date(2026, 8, day)} onDateSelect={onDateSelect}
        availableGames={source === 'cards' ? games : emptyGames}
        dayIndex={source === 'index' ? index : undefined} weatherModeScope="find" />
    </QueryClientProvider>,
  ));
  render(14);
  const initialCellRenders = vi.mocked(useResolvedAppAppearance).mock.calls.length;
  const initialAggregation = vi.mocked(aggregateFindGamesByDay).mock.calls.length;
  const initialIndexAggregation = vi.mocked(aggregateFindDayIndexByDay).mock.calls.length;
  expect(initialCellRenders).toBeGreaterThanOrEqual(28);
  render(15);
  expect(vi.mocked(useResolvedAppAppearance).mock.calls.length - initialCellRenders).toBe(2);
  expect(container.querySelector('[aria-selected="true"]')?.textContent).toContain('15');
  const beforeUnread = vi.mocked(useResolvedAppAppearance).mock.calls.length;
  act(() => useUnreadStore.setState({ displayedByContext: { 'GAME:game': 3 } }));
  expect(vi.mocked(useResolvedAppAppearance).mock.calls.length - beforeUnread).toBe(1);
  expect(container.querySelector('[aria-selected="true"] .status-pulse-dot')).not.toBeNull();
  expect(aggregateFindGamesByDay).toHaveBeenCalledTimes(initialAggregation);
  expect(aggregateFindDayIndexByDay).toHaveBeenCalledTimes(initialIndexAggregation);
  act(() => useUnreadStore.setState({ displayedByContext: { 'GAME:game': 0 } }));
  expect(container.querySelector('[aria-selected="true"] .status-pulse-dot')).toBeNull();
  const day16 = [...container.querySelectorAll<HTMLButtonElement>('button[aria-selected]')]
    .find((button) => button.querySelector('span')?.textContent === '16');
  act(() => day16!.click());
  expect(onDateSelect).toHaveBeenLastCalledWith(new Date(2026, 8, 16));
});

it('changes a cached weather month without constructing a formatter for every hourly point', () => {
  localStorage.setItem('padelpulse-calendar-weather-mode-find', '1');
  for (let offset = 0; offset < 100; offset++) {
    const day = new Date(Date.UTC(2026, 3, 1 + offset));
    const date = day.toISOString().slice(0, 10);
    const weather: WeatherDay = {
      provider: 'open-meteo', cityId: 'city', cityName: 'City', cityTimezone: 'Europe/Belgrade',
      date, fetchedAt: '2026-09-15T00:00:00Z', stale: false, source: 'archive',
      available: true, attribution: 'Open-Meteo',
      hours: Array.from({ length: 24 }, (_, hour) => ({
        time: new Date(+day + hour * 3_600_000).toISOString(),
        temperatureC: hour, temperatureF: hour * 1.8 + 32, weatherCode: 0,
        conditionKey: 'clear', precipitationProbability: 0, precipitationMm: 0,
        windSpeedKmh: 5, relativeHumidity: 50, isDay: hour > 6 && hour < 20,
      })),
    };
    client.setQueryData(weatherDayQueryOptions('city', date).queryKey, weather);
  }
  function CalendarWithSelection() {
    const [date, setDate] = useState(new Date(2026, 4, 31));
    return <MonthCalendar selectedDate={date} onDateSelect={setDate}
      availableGames={emptyGames} weatherModeScope="find" />;
  }
  act(() => root.render(
    <QueryClientProvider client={client}><CalendarWithSelection /></QueryClientProvider>,
  ));
  const OriginalFormatter = Intl.DateTimeFormat;
  const formatter = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) {
    return new OriginalFormatter(locales, options);
  });
  try {
    act(() => container.querySelector('.lucide-chevron-right')!.closest('button')!.click());
    expect(container.querySelector('h3')?.textContent).toBe('Jun');
    expect(container.querySelector('[aria-selected="true"] > span')?.textContent).toBe('30');
    expect(container.querySelectorAll('[data-calendar-day-weather]').length).toBeGreaterThan(28);
    const hourlyFormatters = formatter.mock.calls.filter(([, options]) => options?.hour === 'numeric');
    expect(hourlyFormatters.length).toBeLessThanOrEqual(1);
  } finally {
    formatter.mockRestore();
  }
});
