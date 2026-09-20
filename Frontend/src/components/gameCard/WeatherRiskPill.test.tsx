// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeatherRisk } from '@/types/gameCardEnrichment';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}|${Object.values(values).join('|')}` : key,
    i18n: { language: 'en-GB' },
  }),
}));

import { WeatherRiskPill } from './WeatherRiskPill';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const rain: WeatherRisk = {
  severity: 'likely',
  pop: 70,
  windKph: 8,
  at: '2026-09-21T17:00:00.000Z',
};

describe('WeatherRiskPill', () => {
  it('renders nothing without a risk', () => {
    const host = render(<WeatherRiskPill weatherRisk={null} locale="en-GB" />);
    expect(host.textContent).toBe('');
  });

  it('renders nothing for a severity of none', () => {
    const host = render(
      <WeatherRiskPill weatherRisk={{ ...rain, severity: 'none' }} locale="en-GB" />,
    );
    expect(host.textContent).toBe('');
  });

  it('shows the percentage in amber for rain and reads it out in full', () => {
    const host = render(
      <WeatherRiskPill weatherRisk={rain} locale="en-GB" timeZone="UTC" />,
    );
    const pill = host.querySelector('[role="img"]') as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.className).toContain('amber');
    expect(pill.textContent).toContain('70');
    expect(pill.getAttribute('aria-label')).toBe('weatherAlerts.pillAriaRain|70%|17:00');
  });

  it('shows the wind speed in slate when wind is the reason', () => {
    const host = render(
      <WeatherRiskPill
        weatherRisk={{ severity: 'likely', pop: 10, windKph: 45, at: rain.at }}
        locale="en-GB"
        timeZone="UTC"
      />,
    );
    const pill = host.querySelector('[role="img"]') as HTMLElement;
    expect(pill.className).toContain('slate');
    expect(pill.getAttribute('aria-label')).toContain('weatherAlerts.pillAriaWind');
  });

  it('turns neutral grey after "Keep as planned"', () => {
    const host = render(
      <WeatherRiskPill weatherRisk={{ ...rain, keptAsPlanned: true }} locale="en-GB" />,
    );
    const pill = host.querySelector('[role="img"]') as HTMLElement;
    expect(pill.className).toContain('gray');
    expect(pill.className).not.toContain('amber');
    expect(pill.getAttribute('aria-label')).toBe('weatherAlerts.pillAriaKept');
  });

  it('shows the forecast tooltip only after a long press', () => {
    vi.useFakeTimers();
    try {
      const host = render(
        <WeatherRiskPill weatherRisk={rain} locale="en-GB" timeZone="UTC" />,
      );
      const pill = host.querySelector('[role="img"]') as HTMLElement;
      expect(host.querySelector('[role="tooltip"]')).toBeNull();

      act(() => {
        pill.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(host.querySelector('[role="tooltip"]')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(host.querySelector('[role="tooltip"]')?.textContent).toContain(
        'weatherAlerts.pillTooltip',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
