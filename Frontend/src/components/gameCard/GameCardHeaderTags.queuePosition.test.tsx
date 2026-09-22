/**
 * @vitest-environment jsdom
 *
 * PRD 359 — "In queue · 2nd" in the card's existing participation pill.
 *
 * The pill must not grow a second row, change colour or change size: the only
 * difference is the ordinal, and it disappears whenever the order is unknown.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && 'position' in params ? `${key}:${params.position}` : key,
    i18n: {
      get language() {
        return language;
      },
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { GameCardHeaderTags } = await import('./GameCardHeaderTags');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  language = 'en';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const game = {
  id: 'g1',
  entityType: 'GAME',
  status: 'ANNOUNCED',
  resultsStatus: 'NONE',
  isPublic: true,
  genderTeams: 'ANY',
  affectsRating: true,
} as unknown as Game;

function render(props: Partial<React.ComponentProps<typeof GameCardHeaderTags>>) {
  act(() => {
    root.render(
      <GameCardHeaderTags
        game={game}
        sportTags={null}
        myParticipationBadge="in_queue"
        {...props}
      />,
    );
  });
  return container.textContent ?? '';
}

describe('GameCardHeaderTags — queue position', () => {
  it('shows the English ordinal in the queue pill', () => {
    expect(render({ queuePosition: 2 })).toContain('games.statusInQueueWithPosition:2nd');
  });

  it('falls back to the locale written form where there is no suffix', () => {
    language = 'ja';
    // The `t` mock echoes the resolved position, which for `ja` is the raw
    // number handed to `games.queuePositionOrdinal`.
    expect(render({ queuePosition: 2 })).toContain('games.statusInQueueWithPosition:');
    expect(render({ queuePosition: 2 })).toContain('games.queuePositionOrdinal:2');
  });

  it('stays at plain "In queue" when the position is unknown', () => {
    expect(render({ queuePosition: null })).toContain('games.statusInQueue');
    expect(render({ queuePosition: null })).not.toContain('WithPosition');
    expect(render({})).toContain('games.statusInQueue');
  });

  it('never decorates another badge with a position', () => {
    expect(render({ myParticipationBadge: 'playing', queuePosition: 2 })).not.toContain(
      'WithPosition',
    );
    expect(render({ myParticipationBadge: 'invited', queuePosition: 2 })).toContain(
      'games.statusInvited',
    );
  });

  it('keeps the pill a single element in the existing tag row', () => {
    render({ queuePosition: 3 });
    const pills = container.querySelectorAll('span.rounded-full');
    expect(pills.length).toBe(1);
    expect(pills[0].className).toContain('bg-sky-100');
  });
});
