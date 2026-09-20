// @vitest-environment jsdom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameWeatherAlertState } from '@/api/gameWeather';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const alertState = { data: undefined as GameWeatherAlertState | undefined };
const mutateCalls: unknown[] = [];

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => alertState,
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: () => unknown }) => ({
    mutate: () => mutateCalls.push(mutationFn),
    isPending: false,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}|${Object.values(values).join('|')}` : key,
    i18n: { language: 'en-GB' },
  }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => {
          const {
            initial: _initial,
            animate: _animate,
            exit: _exit,
            transition: _transition,
            ...rest
          } = props;
          return createElement(tag, rest, children);
        },
    },
  ),
}));

const reducedMotion = { value: false };
vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => reducedMotion.value,
}));

vi.mock('@/store/socketEventsStore', () => ({
  useSocketEventsStore: () => null,
}));

const weatherWindow = { data: undefined as { hours: { time: string; conditionKey: string; isDay: boolean }[] } | undefined };
vi.mock('@/queries/weather', () => ({ useGameWeatherQuery: () => weatherWindow }));

vi.mock('@/components/weather/WeatherIcon', () => ({
  WeatherIcon: () => <span data-testid="weather-icon" />,
}));
vi.mock('@/components/weather/GameWeatherDialog', () => ({
  GameWeatherDialog: ({ open }: { open: boolean }) => (open ? <div>forecast-dialog</div> : null),
}));
vi.mock('@/components/weather/MoveIndoorSheet', () => ({
  MoveIndoorSheet: ({ open }: { open: boolean }) => (open ? <div>move-indoor-sheet</div> : null),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/chat', () => ({ chatApi: { createMessage: vi.fn() } }));
vi.mock('@/api/gameWeather', () => ({
  gameWeatherApi: { getAlertState: vi.fn(), keepAsPlanned: vi.fn() },
}));
vi.mock('@/queries/queryKeys', () => ({
  queryKeys: { weatherAlerts: { game: (id: string) => ['wa', id] } },
}));

import { WeatherRiskBanner } from './WeatherRiskBanner';

const game = {
  id: 'game-1',
  startTime: '2026-09-21T17:00:00.000Z',
  endTime: '2026-09-21T18:30:00.000Z',
  timeIsSet: true,
  city: { id: 'city-1', timezone: 'UTC' },
} as never;

function state(overrides: Partial<GameWeatherAlertState> = {}): GameWeatherAlertState {
  return {
    severity: 'likely',
    pop: 70,
    windKph: 8,
    at: '2026-09-21T17:00:00.000Z',
    windDriven: false,
    keptAsPlanned: false,
    keepAsPlannedAt: null,
    outdoor: true,
    outdoorCourtCount: 1,
    totalCourtCount: 1,
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

beforeEach(() => {
  alertState.data = undefined;
  weatherWindow.data = undefined;
  reducedMotion.value = false;
  mutateCalls.length = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const noop = () => undefined;

describe('WeatherRiskBanner', () => {
  it('renders nothing before the alert state arrives', () => {
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    expect(host.textContent).toBe('');
  });

  it('renders nothing for an indoor game', () => {
    alertState.data = state({ outdoor: false, severity: 'none' });
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    expect(host.textContent).toBe('');
  });

  it('renders nothing when there is no forecast — never a "no data" banner', () => {
    alertState.data = state({ severity: 'none' });
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    expect(host.textContent).toBe('');
  });

  it('shows the rain headline in amber with the three organizer chips', () => {
    alertState.data = state();
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    const section = host.querySelector('section') as HTMLElement;
    expect(section.className).toContain('amber');
    expect(section.textContent).toContain('weatherAlerts.rainLikely');
    expect(section.textContent).toContain('weatherAlerts.detailRain|70%|17:00');
    const chips = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(chips.join('|')).toContain('weatherAlerts.moveIndoor');
    expect(chips.join('|')).toContain('weatherAlerts.changeTime');
    expect(chips.join('|')).toContain('weatherAlerts.keepAsPlanned');
    expect(chips.join('|')).toContain('weatherAlerts.askTheGroup');
  });

  it('reads slate when wind is the reason', () => {
    alertState.data = state({ windDriven: true, windKph: 48, pop: 5 });
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    const section = host.querySelector('section') as HTMLElement;
    expect(section.className).toContain('slate');
    expect(section.textContent).toContain('weatherAlerts.strongWind');
  });

  it('gives participants only the forecast action', () => {
    alertState.data = state();
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer={false} onChangeTime={noop} locale="en-GB" />,
    );
    const chips = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain('weatherAlerts.forecast');

    act(() => (host.querySelector('button') as HTMLButtonElement).click());
    expect(host.textContent).toContain('forecast-dialog');
  });

  it('collapses to the grey "rain or shine" line once kept as planned', () => {
    alertState.data = state({ keptAsPlanned: true, keepAsPlannedAt: '2026-09-21T06:00:00.000Z' });
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    expect(host.querySelector('section')).toBeNull();
    expect(host.textContent).toContain('weatherAlerts.playingRainOrShine');
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders the four-icon hourly strip with an accessible label', () => {
    alertState.data = state();
    weatherWindow.data = {
      hours: [
        { time: '2026-09-21T15:00:00.000Z', conditionKey: 'rain', isDay: true },
        { time: '2026-09-21T16:00:00.000Z', conditionKey: 'rain', isDay: true },
        { time: '2026-09-21T17:00:00.000Z', conditionKey: 'rain', isDay: true },
        { time: '2026-09-21T18:00:00.000Z', conditionKey: 'rain', isDay: true },
        { time: '2026-09-21T19:00:00.000Z', conditionKey: 'rain', isDay: true },
      ],
    };
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    const list = host.querySelector('ul') as HTMLElement;
    expect(list.getAttribute('aria-label')).toBe('weatherAlerts.hourlyStripLabel');
    expect(list.querySelectorAll('li')).toHaveLength(4);
  });

  it('opens the move-indoor sheet from the deep link', () => {
    alertState.data = state();
    const consumed = vi.fn();
    const host = render(
      <WeatherRiskBanner
        game={game}
        isOrganizer
        onChangeTime={noop}
        locale="en-GB"
        autoOpenMoveIndoor
        onAutoOpenConsumed={consumed}
      />,
    );
    expect(host.textContent).toContain('move-indoor-sheet');
    expect(consumed).toHaveBeenCalled();
  });

  it('scrolls itself into view for a plain ?section=weather link', () => {
    // The "View forecast" push action every participant gets carries no
    // `action=`; the intent used to be computed and then dropped on the floor.
    alertState.data = state();
    const consumed = vi.fn();
    const scrollIntoView = vi.fn();
    const proto = window.HTMLElement.prototype as unknown as {
      scrollIntoView: typeof scrollIntoView;
    };
    const original = proto.scrollIntoView;
    proto.scrollIntoView = scrollIntoView;
    try {
      const host = render(
        <WeatherRiskBanner
          game={game}
          isOrganizer={false}
          onChangeTime={noop}
          locale="en-GB"
          autoScrollIntoView
          onAutoOpenConsumed={consumed}
        />,
      );
      expect(host.querySelector('section')).not.toBeNull();
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
      expect(consumed).toHaveBeenCalled();
    } finally {
      proto.scrollIntoView = original;
    }
  });

  it('routes "Change time" to the caller', () => {
    alertState.data = state();
    const onChangeTime = vi.fn();
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={onChangeTime} locale="en-GB" />,
    );
    const chip = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('weatherAlerts.changeTime'),
    ) as HTMLButtonElement;
    act(() => chip.click());
    expect(onChangeTime).toHaveBeenCalled();
  });

  it('runs a mutation for "Keep as planned" and for "Ask the group"', () => {
    alertState.data = state();
    const host = render(
      <WeatherRiskBanner game={game} isOrganizer onChangeTime={noop} locale="en-GB" />,
    );
    const buttons = [...host.querySelectorAll('button')];
    const keep = buttons.find((b) =>
      b.textContent?.includes('weatherAlerts.keepAsPlanned'),
    ) as HTMLButtonElement;
    const ask = buttons.find((b) =>
      b.textContent?.includes('weatherAlerts.askTheGroup'),
    ) as HTMLButtonElement;
    act(() => keep.click());
    act(() => ask.click());
    expect(mutateCalls).toHaveLength(2);
  });
});
