/**
 * @vitest-environment jsdom
 *
 * The ticket stub answers "when": day, start, end — or live / played / TBD.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGameCardTicketTheme } from '@/utils/gameCardEntityTheme';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { GameCardStub } = await import('./GameCardStub');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<React.ComponentProps<typeof GameCardStub>> = {}) {
  act(() => {
    root.render(
      <GameCardStub
        theme={getGameCardTicketTheme('GAME')}
        status="ANNOUNCED"
        startTime="2026-10-12T17:30:00.000Z"
        startText="18:30"
        endText="20:00"
        dayLabel="Today"
        timeNotSet={false}
        isLeagueSeason={false}
        timezone="Europe/Madrid"
        locale="en-GB"
        weatherSummary={null}
        onWeatherClick={() => {}}
        {...props}
      />,
    );
  });
  return container.textContent ?? '';
}

describe('GameCardStub', () => {
  it('leads with the relative day and shows start and end', () => {
    const text = render();
    expect(text).toContain('Today');
    expect(text).toContain('18:30');
    expect(text).toContain('– 20:00');
    // The relative day replaces the calendar date.
    expect(text).not.toContain('Oct');
  });

  it('falls back to weekday + date when the game is further away', () => {
    const text = render({ dayLabel: null });
    expect(text).toContain('Mon');
    expect(text).toContain('12 Oct');
  });

  it('sets a 12 h meridiem apart so the time still fits the stub', () => {
    render({ startText: '6:30 PM' });
    const suffix = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'PM');
    expect(suffix).toBeTruthy();
  });

  it('says the game is live instead of the day', () => {
    const text = render({ status: 'STARTED' });
    expect(text).toContain('games.status.started');
    expect(text).not.toContain('Today');
  });

  it('shows the not-set state when there is no time', () => {
    const text = render({ timeNotSet: true });
    expect(text).toContain('gameDetails.datetimeNotSet');
    expect(text).not.toContain('18:30');
  });
});
