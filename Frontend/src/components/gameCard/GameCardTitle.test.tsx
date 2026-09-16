// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';
import type { GameLocalizedTextProjection } from '@/utils/gameText/gameLocalizedText.types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ru' },
  }),
}));

import { GameCardTitle } from './GameCardTitle';

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(node);
  });
  return container;
}

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    sport: 'PADEL',
    gameType: 'CLASSIC',
    name: 'Sunday social',
    city: { id: 'c1', name: 'City', country: 'X' } as Game['city'],
    startTime: '2026-05-21T17:00:00.000Z',
    endTime: '2026-05-21T19:00:00.000Z',
    maxParticipants: 4,
    minParticipants: 2,
    isPublic: true,
    affectsRating: true,
    allowDirectJoin: true,
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    participants: [],
    ...overrides,
  } as Game;
}

function projection(
  overrides: Partial<GameLocalizedTextProjection['name']> & {
    locale?: GameLocalizedTextProjection['locale'];
  } = {},
): GameLocalizedTextProjection {
  const { locale, ...nameOverrides } = overrides;
  return {
    locale: locale ?? 'ru',
    name: {
      text: 'Воскресный социал',
      sourceRevision: 1,
      state: 'ready',
      provenance: 'automatic',
      ...nameOverrides,
    },
    description: {
      text: null,
      sourceRevision: 0,
      state: 'not_needed',
      provenance: 'empty_source',
    },
  };
}

describe('GameCardTitle', () => {
  it('renders localized title when localizedText is ready', () => {
    const el = render(
      <GameCardTitle game={baseGame({ localizedText: projection() })} />,
    );
    expect(el.textContent).toContain('Воскресный социал');
    expect(el.textContent).not.toContain('Sunday social');
  });

  it('falls back to original name when translation is pending', () => {
    const el = render(
      <GameCardTitle
        game={baseGame({
          localizedText: projection({
            text: 'Sunday social',
            state: 'pending',
            provenance: 'original',
            sourceRevision: 0,
          }),
        })}
      />,
    );
    expect(el.textContent).toContain('Sunday social');
  });

  it('falls back to original when localizedText is missing', () => {
    const el = render(<GameCardTitle game={baseGame()} />);
    expect(el.textContent).toContain('Sunday social');
  });

  it('resolves nested parent-season name for league round cards', () => {
    const el = render(
      <GameCardTitle
        game={baseGame({
          entityType: 'LEAGUE',
          name: null,
          leagueRound: { id: 'r1', orderIndex: 0 },
          parent: {
            id: 'season',
            leagueSeason: {
              id: 'ls1',
              leagueId: 'lg1',
              league: { id: 'lg1', name: 'City League' },
              game: {
                id: 'season-game',
                name: 'Spring 2026',
                localizedText: projection({ text: 'Весна 2026' }),
              },
            },
          },
        })}
      />,
    );
    expect(el.textContent).toContain('City League');
    expect(el.textContent).toContain('Весна 2026');
    expect(el.textContent).not.toContain('Spring 2026');
  });
});
