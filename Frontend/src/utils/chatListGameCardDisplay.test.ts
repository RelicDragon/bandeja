import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import { getGameChatListTitle } from './chatListGameCardDisplay';
import type { GameLocalizedTextProjection } from './gameText/gameLocalizedText.types';

const t = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as TFunction;

function projection(
  overrides: Partial<GameLocalizedTextProjection['name']> & {
    locale?: GameLocalizedTextProjection['locale'];
  } = {},
): GameLocalizedTextProjection {
  const { locale, ...nameOverrides } = overrides;
  return {
    locale: locale ?? 'ru',
    name: {
      text: 'Воскресный',
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

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    sport: 'PADEL',
    gameType: 'CLASSIC',
    name: 'Sunday',
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

describe('getGameChatListTitle', () => {
  it('uses localized name when ready', () => {
    expect(
      getGameChatListTitle(baseGame({ localizedText: projection() }), t, 'ru'),
    ).toBe('Воскресный');
  });

  it('falls back to original when pending', () => {
    expect(
      getGameChatListTitle(
        baseGame({
          localizedText: projection({
            text: 'Sunday',
            state: 'pending',
            provenance: 'original',
            sourceRevision: 0,
          }),
        }),
        t,
        'ru',
      ),
    ).toBe('Sunday');
  });

  it('resolves nested parent-season name for league fixtures', () => {
    const title = getGameChatListTitle(
      baseGame({
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
              name: 'Spring',
              localizedText: projection({ text: 'Весна' }),
            },
          },
        },
      }),
      t,
      'ru',
    );
    expect(title).toBe('City League · Весна');
  });
});
