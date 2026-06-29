import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { resolveGameWeatherQueryParams } from './gameWeatherQueryParams';

describe('resolveGameWeatherQueryParams', () => {
  it('uses city and schedule data so weather lookup is not tied to game access', () => {
    const game = {
      id: 'game-1',
      city: { id: 'city-1' },
      startTime: '2026-07-01T18:00:00.000Z',
      endTime: '2026-07-01T19:30:00.000Z',
      participants: [],
    } as unknown as Game;

    expect(resolveGameWeatherQueryParams(game)).toEqual({
      cityId: 'city-1',
      startTime: '2026-07-01T18:00:00.000Z',
      endTime: '2026-07-01T19:30:00.000Z',
    });
  });

  it('falls back to club city data when the game city is missing from a slim payload', () => {
    const game = {
      club: { cityId: 'club-city-1' },
      startTime: '2026-07-01T18:00:00.000Z',
      endTime: '2026-07-01T19:30:00.000Z',
    } as unknown as Game;

    expect(resolveGameWeatherQueryParams(game)?.cityId).toBe('club-city-1');
  });

  it('does not enable weather queries without city and schedule data', () => {
    const game = {
      city: null,
      startTime: '2026-07-01T18:00:00.000Z',
      endTime: '2026-07-01T19:30:00.000Z',
    } as unknown as Game;

    expect(resolveGameWeatherQueryParams(game)).toBeNull();
  });
});
