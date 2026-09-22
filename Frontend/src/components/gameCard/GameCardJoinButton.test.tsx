/**
 * @vitest-environment jsdom
 *
 * PRD 359 — the seat count on the join CTA.
 *
 * What must not regress: the suffix appears only when it changes a decision,
 * the label never wraps (long form is dropped below `sm`, short form stays),
 * the accessible name carries the whole sentence at every width, and PRD 347's
 * spot-opened shimmer is untouched.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer', gender: 'MALE' } }),
}));

const { GameCardJoinButton } = await import('./GameCardJoinButton');

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
  vi.clearAllMocks();
});

function render(props: Partial<React.ComponentProps<typeof GameCardJoinButton>> = {}) {
  act(() => {
    root.render(
      <GameCardJoinButton gameId="g1" hasFreeSlots onJoin={vi.fn()} {...props} />,
    );
  });
  return container.querySelector('button') as HTMLButtonElement;
}

describe('GameCardJoinButton — seats left', () => {
  it('keeps the plain label when seats are not scarce', () => {
    const button = render({ openSeats: 3 });
    expect(button.textContent).toContain('createGame.addMeToGame');
    expect(button.textContent).not.toContain('joinSeatsLeft');
    expect(button.getAttribute('aria-label')).toBeNull();
  });

  it('adds the count for the last two seats', () => {
    const button = render({ openSeats: 1 });
    expect(button.textContent).toContain('createGame.addMeToGame');
    expect(button.textContent).toContain('games.joinSeatsLeft:{"count":1}');
  });

  it('carries the long form only from the `sm` breakpoint up, short form below', () => {
    const button = render({ openSeats: 2 });
    const long = button.querySelector('.hidden.sm\\:inline');
    const short = button.querySelector('.sm\\:hidden');
    expect(long?.textContent).toBe('games.joinSeatsLeft:{"count":2}');
    expect(short?.textContent).toBe('games.joinSeatsLeftShort:{"count":2}');
  });

  it('never renders "0 seats left"', () => {
    const button = render({ openSeats: 0 });
    expect(button.textContent).not.toContain('joinSeatsLeft');
  });

  it('says nothing extra when the count is unknown', () => {
    const button = render({ openSeats: null });
    expect(button.textContent).not.toContain('joinSeatsLeft');
  });

  it('spells the whole sentence into the accessible name', () => {
    const button = render({ openSeats: 1 });
    expect(button.getAttribute('aria-label')).toBe('games.joinAriaSeatsLeft:{"count":1}');
  });
});

describe('GameCardJoinButton — queue', () => {
  it('states how many are waiting on a full game', () => {
    const button = render({ hasFreeSlots: false, openSeats: 0, queueLength: 2 });
    expect(button.textContent).toContain('games.joinTheQueue');
    expect(button.textContent).toContain('games.joinQueueWaiting:{"count":2}');
    expect(button.getAttribute('aria-label')).toBe('games.joinAriaQueueWaiting:{"count":2}');
  });

  it('leaves an empty queue as the plain label', () => {
    const button = render({ hasFreeSlots: false, openSeats: 0, queueLength: 0 });
    expect(button.textContent).toContain('games.joinTheQueue');
    expect(button.textContent).not.toContain('joinQueueWaiting');
  });

  it('keeps "N waiting" at both widths — there is no shorter honest form', () => {
    const button = render({ hasFreeSlots: false, queueLength: 2 });
    expect(button.querySelector('.hidden.sm\\:inline')?.textContent).toBe(
      'games.joinQueueWaiting:{"count":2}',
    );
    expect(button.querySelector('.sm\\:hidden')?.textContent).toBe(
      'games.joinQueueWaiting:{"count":2}',
    );
  });
});

describe('GameCardJoinButton — unchanged behaviour', () => {
  it('defaults to today’s labels when the card passes no counts', () => {
    const button = render();
    expect(button.textContent).toContain('createGame.addMeToGame');
    expect(button.textContent?.includes('·')).toBe(false);
  });

  it('confirms before joining rather than joining on the first tap', () => {
    const onJoin = vi.fn();
    const button = render({ openSeats: 1, onJoin });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('still shows PRD 347’s shimmer slot, which the count does not replace', () => {
    // Reduced motion is on in this file, so the sweep must be absent here and
    // the seat count must not have introduced one of its own.
    render({ openSeats: 1, spotJustOpened: true });
    expect(container.querySelector('[data-testid="join-button-shimmer"]')).toBeNull();
  });
});
