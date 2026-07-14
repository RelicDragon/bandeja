import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  buildAuthenticatedNextGamesEnvelope,
  buildUnauthenticatedNextGamesEnvelope,
  countPlayingParticipants,
  mapGameToCachedNextGameDTO,
  resolveCachedNextGameTitle,
  resolveWidgetUiLanguage,
} from './cachedNextGameDto';

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    entityType: 'GAME',
    gameType: 'MATCH',
    city: { id: 'c1', name: 'City', timezone: 'UTC' } as Game['city'],
    startTime: '2026-07-14T10:00:00.000Z',
    endTime: '2026-07-14T11:00:00.000Z',
    maxParticipants: 4,
    minParticipants: 2,
    isPublic: true,
    affectsRating: true,
    allowDirectJoin: true,
    status: 'SCHEDULED',
    resultsStatus: 'NONE',
    participants: [
      { status: 'PLAYING' } as Game['participants'][number],
      { status: 'INVITED' } as Game['participants'][number],
      { status: 'PLAYING' } as Game['participants'][number],
    ],
    ...overrides,
  };
}

describe('cachedNextGameDto', () => {
  it('resolves supported widget languages', () => {
    expect(resolveWidgetUiLanguage('es-ES')).toBe('es');
    expect(resolveWidgetUiLanguage('ru')).toBe('ru');
    expect(resolveWidgetUiLanguage('de')).toBe('en');
  });

  it('prefers name then club then gameType for title', () => {
    expect(resolveCachedNextGameTitle(baseGame({ name: '  Open play  ' }))).toBe('Open play');
    expect(
      resolveCachedNextGameTitle(
        baseGame({ name: null, club: { id: 'cl1', name: '  Arena  ' } as Game['club'] }),
      ),
    ).toBe('Arena');
    expect(resolveCachedNextGameTitle(baseGame({ name: null, club: undefined }))).toBe('MATCH');
  });

  it('counts only PLAYING participants', () => {
    expect(countPlayingParticipants(baseGame().participants)).toBe(2);
    expect(countPlayingParticipants(undefined)).toBe(0);
  });

  it('maps Game to CachedNextGameDTO fields', () => {
    const dto = mapGameToCachedNextGameDTO(
      baseGame({
        name: 'Morning',
        sport: 'PADEL',
        playersPerMatch: 4,
        club: { id: 'cl1', name: 'Club A' } as Game['club'],
      }),
    );
    expect(dto).toEqual({
      id: 'game-1',
      title: 'Morning',
      clubName: 'Club A',
      startTime: '2026-07-14T10:00:00.000Z',
      status: 'SCHEDULED',
      resultsStatus: 'NONE',
      gameType: 'MATCH',
      participantCount: 2,
      maxParticipants: 4,
      sport: 'PADEL',
      playersPerMatch: 4,
    });
  });

  it('builds authenticated and unauthenticated envelopes', () => {
    const auth = buildAuthenticatedNextGamesEnvelope([baseGame({ name: 'A' })], 'sr-RS');
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.language).toBe('sr');
    expect(auth.games).toHaveLength(1);

    const signedOut = buildUnauthenticatedNextGamesEnvelope('cs');
    expect(signedOut).toEqual({
      isAuthenticated: false,
      language: 'cs',
      games: [],
    });
  });
});
