/**
 * PRD 347 — the 2 h window and the day-group sort boost.
 *
 * The sort lives on the client only (the backend deliberately does not
 * reorder), so these assertions are the contract Find, Home and My Tab share.
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  SPOT_OPENED_WINDOW_MS,
  hasOpenSpotHighlight,
  isWithinSpotOpenedWindow,
  resolveSpotOpenedAt,
  sortDayGroupGames,
} from './spotOpenedWindow';

const NOW = new Date('2026-03-01T12:00:00.000Z').getTime();

function game(overrides: Partial<Game> & { id: string; startTime: string }): Game {
  return {
    resultsStatus: 'NONE',
    ...overrides,
  } as Game;
}

describe('isWithinSpotOpenedWindow', () => {
  it('accepts the whole 2 h window and nothing outside it', () => {
    expect(SPOT_OPENED_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
    expect(isWithinSpotOpenedWindow(new Date(NOW).toISOString(), NOW)).toBe(true);
    expect(
      isWithinSpotOpenedWindow(new Date(NOW - SPOT_OPENED_WINDOW_MS + 1).toISOString(), NOW),
    ).toBe(true);
    expect(
      isWithinSpotOpenedWindow(new Date(NOW - SPOT_OPENED_WINDOW_MS - 1).toISOString(), NOW),
    ).toBe(false);
  });

  it('is falsy for missing, malformed and future timestamps', () => {
    expect(isWithinSpotOpenedWindow(null, NOW)).toBe(false);
    expect(isWithinSpotOpenedWindow(undefined, NOW)).toBe(false);
    expect(isWithinSpotOpenedWindow('nonsense', NOW)).toBe(false);
    expect(isWithinSpotOpenedWindow(new Date(NOW + 60_000).toISOString(), NOW)).toBe(false);
  });
});

describe('resolveSpotOpenedAt', () => {
  const fresh = new Date(NOW - 60_000).toISOString();

  it('prefers the enriched field and falls back to the raw column', () => {
    expect(
      resolveSpotOpenedAt(
        { spotOpenedAt: fresh, lastSeatOpenedAt: null, resultsStatus: 'NONE' } as Game,
        NOW,
      ),
    ).toBe(fresh);
    expect(
      resolveSpotOpenedAt(
        { spotOpenedAt: null, lastSeatOpenedAt: fresh, resultsStatus: 'NONE' } as Game,
        NOW,
      ),
    ).toBe(fresh);
  });

  it('never shows the pill once results are locked', () => {
    for (const resultsStatus of ['IN_PROGRESS', 'FINAL'] as const) {
      expect(
        resolveSpotOpenedAt({ spotOpenedAt: fresh, resultsStatus } as Game, NOW),
      ).toBeNull();
    }
  });
});

describe('sortDayGroupGames', () => {
  const fresh = new Date(NOW - 60_000).toISOString();
  const stale = new Date(NOW - 5 * 60 * 60 * 1000).toISOString();

  it('floats cards with a live pill to the top', () => {
    const games = [
      game({ id: 'early', startTime: '2026-03-01T18:00:00.000Z' }),
      game({ id: 'open-a', startTime: '2026-03-01T20:00:00.000Z', spotOpenedAt: fresh }),
      game({ id: 'mid', startTime: '2026-03-01T19:00:00.000Z' }),
      game({ id: 'open-b', startTime: '2026-03-01T21:00:00.000Z', spotOpenedAt: fresh }),
    ];
    expect(sortDayGroupGames(games, NOW).map((g) => g.id)).toEqual([
      'open-a',
      'open-b',
      'early',
      'mid',
    ]);
  });

  it('is a stable partition, so a caller ordering descending keeps it', () => {
    // Home's "finished" list is sorted newest-first before grouping; the boost
    // must not silently flip it back to ascending.
    const games = [
      game({ id: 'late', startTime: '2026-03-01T21:00:00.000Z' }),
      game({ id: 'mid', startTime: '2026-03-01T20:00:00.000Z' }),
      game({ id: 'open', startTime: '2026-03-01T18:00:00.000Z', spotOpenedAt: fresh }),
      game({ id: 'early', startTime: '2026-03-01T19:00:00.000Z' }),
    ];
    expect(sortDayGroupGames(games, NOW).map((g) => g.id)).toEqual([
      'open',
      'late',
      'mid',
      'early',
    ]);
  });

  it('ignores expired and locked events', () => {
    const games = [
      game({ id: 'a', startTime: '2026-03-01T18:00:00.000Z' }),
      game({ id: 'expired', startTime: '2026-03-01T21:00:00.000Z', spotOpenedAt: stale }),
      game({
        id: 'locked',
        startTime: '2026-03-01T22:00:00.000Z',
        spotOpenedAt: fresh,
        resultsStatus: 'FINAL',
      }),
    ];
    expect(sortDayGroupGames(games, NOW).map((g) => g.id)).toEqual(['a', 'expired', 'locked']);
  });

  it('leaves a list with no live pill completely untouched', () => {
    const games = [
      game({ id: 'c', startTime: '2026-03-01T22:00:00.000Z' }),
      game({ id: 'a', startTime: '2026-03-01T18:00:00.000Z' }),
      game({ id: 'b', startTime: '2026-03-01T20:00:00.000Z' }),
    ];
    expect(sortDayGroupGames(games, NOW).map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input array', () => {
    const games = [
      game({ id: 'a', startTime: '2026-03-01T21:00:00.000Z' }),
      game({ id: 'b', startTime: '2026-03-01T18:00:00.000Z' }),
    ];
    const copy = [...games];
    sortDayGroupGames(games, NOW);
    expect(games).toEqual(copy);
  });

  it('hasOpenSpotHighlight matches resolveSpotOpenedAt', () => {
    expect(hasOpenSpotHighlight(game({ id: 'x', startTime: '', spotOpenedAt: fresh }), NOW)).toBe(
      true,
    );
    expect(hasOpenSpotHighlight(game({ id: 'x', startTime: '', spotOpenedAt: stale }), NOW)).toBe(
      false,
    );
  });
});

/**
 * The seat was refilled — the pill must go with it.
 *
 * `Game.lastSeatOpenedAt` is never cleared, so with `autoFillFromQueue` on the
 * queue head takes the seat within a second. Before this, every Find / My-Tab
 * card kept the "A spot opened" pill, and the day-group boost, for the rest of
 * the 2 h window on a game that was already full.
 */
describe('resolveSpotOpenedAt — the seat has to still be open', () => {
  const fresh = new Date(NOW - 60_000).toISOString();

  const roster = (playing: number) =>
    Array.from({ length: playing }, (_, i) => ({
      userId: `p${i}`,
      status: 'PLAYING',
    })) as unknown as Game['participants'];

  it('drops the pill once the roster is full again', () => {
    expect(
      resolveSpotOpenedAt(
        game({
          id: 'full',
          startTime: '',
          spotOpenedAt: fresh,
          maxParticipants: 4,
          participants: roster(4),
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('keeps the pill while a seat is genuinely open', () => {
    expect(
      resolveSpotOpenedAt(
        game({
          id: 'open',
          startTime: '',
          spotOpenedAt: fresh,
          maxParticipants: 4,
          participants: roster(3),
        }),
        NOW,
      ),
    ).toBe(fresh);
  });

  it('ignores non-PLAYING rows when counting the roster', () => {
    const mixed = [
      ...(roster(3) as unknown as Array<{ userId: string; status: string }>),
      { userId: 'q1', status: 'IN_QUEUE' },
      { userId: 'i1', status: 'INVITED' },
    ] as unknown as Game['participants'];
    expect(
      resolveSpotOpenedAt(
        game({
          id: 'mixed',
          startTime: '',
          spotOpenedAt: fresh,
          maxParticipants: 4,
          participants: mixed,
        }),
        NOW,
      ),
    ).toBe(fresh);
  });

  it('fails open when the card carries no roster', () => {
    expect(
      resolveSpotOpenedAt(
        game({ id: 'bare', startTime: '', spotOpenedAt: fresh, maxParticipants: 4 }),
        NOW,
      ),
    ).toBe(fresh);
  });

  it('keeps a full game out of the day-group boost', () => {
    const games = [
      game({
        id: 'full',
        startTime: '2026-03-01T21:00:00.000Z',
        spotOpenedAt: fresh,
        maxParticipants: 4,
        participants: roster(4),
      }),
      game({
        id: 'open',
        startTime: '2026-03-01T22:00:00.000Z',
        spotOpenedAt: fresh,
        maxParticipants: 4,
        participants: roster(2),
      }),
    ];
    expect(sortDayGroupGames(games, NOW).map((g) => g.id)).toEqual(['open', 'full']);
  });
});

