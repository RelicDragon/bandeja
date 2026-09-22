/**
 * @vitest-environment jsdom
 *
 * PRD 360 — the "Novices welcome" tag on a game card.
 *
 * Three things must hold and are all easy to lose in a refactor: it renders
 * only when the organizer said so, it never opens a second tag row, and the
 * label survives the narrow-card collapse for screen readers.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && 'position' in params ? `${key}:${params.position}` : key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { GameCardHeaderTags } = await import('./GameCardHeaderTags');

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

const baseGame = {
  id: 'g1',
  entityType: 'GAME',
  status: 'ANNOUNCED',
  resultsStatus: 'NONE',
  isPublic: true,
  genderTeams: 'ANY',
  affectsRating: true,
} as unknown as Game;

function render(game: Partial<Game>) {
  act(() => {
    root.render(
      <GameCardHeaderTags
        game={{ ...baseGame, ...game } as Game}
        sportTags={null}
        myParticipationBadge={null}
      />,
    );
  });
  return container;
}

function noviceTag(el: HTMLElement): HTMLElement | null {
  return el.querySelector('[title="games.noviceFriendly"]');
}

describe('GameCardHeaderTags — novices welcome', () => {
  it('renders nothing when the organizer did not turn it on', () => {
    expect(noviceTag(render({ suitableForNovices: false }))).toBeNull();
    expect(noviceTag(render({}))).toBeNull();
  });

  it('renders one pill when the organizer turned it on', () => {
    const tag = noviceTag(render({ suitableForNovices: true }));
    expect(tag).not.toBeNull();
    expect(tag!.tagName).toBe('SPAN');
    expect(tag!.className).toContain('rounded-full');
  });

  it('keeps the label reachable when the text collapses on a narrow card', () => {
    const tag = noviceTag(render({ suitableForNovices: true }))!;
    // Visible at >= sm, hidden below it — and a screen reader gets the label at
    // every width from the sr-only twin, which is why the visible copy is
    // aria-hidden rather than simply duplicated.
    const collapsing = tag.querySelector('span.hidden.sm\\:inline');
    expect(collapsing?.textContent).toBe('games.noviceFriendly');
    expect(collapsing?.getAttribute('aria-hidden')).toBe('true');
    expect(tag.querySelector('span.sr-only')?.textContent).toBe('games.noviceFriendly');
    expect(tag.getAttribute('title')).toBe('games.noviceFriendly');
  });

  it('sits in the same tag row as the other pills, after the gender tag', () => {
    const el = render({ suitableForNovices: true, isPublic: false, genderTeams: 'MEN' });
    const tag = noviceTag(el)!;
    const gender = el.querySelector('[title="createGame.genderTeams.MEN"], .bi-gender-male');
    expect(gender).not.toBeNull();
    // `compareDocumentPosition` reads DOM order: the gender marker precedes it.
    expect(gender!.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One flat row of siblings — no nested wrapper introducing a second line.
    expect(tag.parentElement).toBe(el);
  });
});
