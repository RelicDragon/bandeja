/**
 * @vitest-environment jsdom
 *
 * PRD 347 — the "Spot opened" pill.
 *
 * The two things that must not regress: the dot pulses for exactly two 1.2 s
 * cycles and then holds still (and is static from frame one under reduced
 * motion), and the accessible name carries a relative time while the dot
 * itself stays decorative.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPOT_OPENED_PULSE_CYCLES,
  SPOT_OPENED_PULSE_CYCLE_MS,
} from './spotOpenedWindow';

let reduceMotion = false;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en-GB' },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => reduceMotion,
}));

vi.mock('@/utils/dateFormat', () => ({
  formatRelativeTimeSafe: () => '2 minutes ago',
}));

const { SpotOpenedPill } = await import('./SpotOpenedPill');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function render(openedAt: string) {
  act(() => {
    root.render(<SpotOpenedPill openedAt={openedAt} />);
  });
}

describe('SpotOpenedPill', () => {
  it('pulses for exactly two cycles and then holds still', () => {
    render('2026-03-01T12:00:00.000Z');
    const pill = container.querySelector('[data-testid="spot-opened-pill"]');
    expect(pill?.getAttribute('data-pulsing')).toBe('true');
    expect(container.querySelector('.animate-spot-pulse')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(SPOT_OPENED_PULSE_CYCLE_MS * SPOT_OPENED_PULSE_CYCLES - 1);
    });
    expect(
      container
        .querySelector('[data-testid="spot-opened-pill"]')
        ?.getAttribute('data-pulsing'),
    ).toBe('true');

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(
      container
        .querySelector('[data-testid="spot-opened-pill"]')
        ?.getAttribute('data-pulsing'),
    ).toBe('false');
    expect(container.querySelector('.animate-spot-pulse')).toBeNull();
  });

  it('is static from the first frame under reduced motion', () => {
    reduceMotion = true;
    render('2026-03-01T12:00:00.000Z');
    expect(container.querySelector('.animate-spot-pulse')).toBeNull();
    expect(
      container
        .querySelector('[data-testid="spot-opened-pill"]')
        ?.getAttribute('data-pulsing'),
    ).toBe('false');
  });

  it('carries a relative time in the accessible name and hides the dot', () => {
    render('2026-03-01T12:00:00.000Z');
    const pill = container.querySelector('[data-testid="spot-opened-pill"]');
    expect(pill?.getAttribute('aria-label')).toBe(
      'spots.pill.ariaLabel:{"time":"2 minutes ago"}',
    );
    // Not a live region: the pill renders on every eligible card in a list
    // that re-renders on filter changes and socket updates.
    expect(pill?.getAttribute('role')).toBe('img');
    expect(pill?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(pill?.textContent).toContain('spots.pill.label');
  });

  it('restarts the two cycles when a newer event arrives', () => {
    render('2026-03-01T12:00:00.000Z');
    act(() => {
      vi.advanceTimersByTime(SPOT_OPENED_PULSE_CYCLE_MS * SPOT_OPENED_PULSE_CYCLES + 10);
    });
    expect(
      container
        .querySelector('[data-testid="spot-opened-pill"]')
        ?.getAttribute('data-pulsing'),
    ).toBe('false');

    render('2026-03-01T12:30:00.000Z');
    expect(
      container
        .querySelector('[data-testid="spot-opened-pill"]')
        ?.getAttribute('data-pulsing'),
    ).toBe('true');
  });
});
