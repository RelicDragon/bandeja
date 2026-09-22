import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { buildDuplicateGameInitialData } from './buildDuplicateGameInitialData';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    gameType: 'CLASSIC',
    sport: 'PADEL',
    status: 'FINISHED',
    resultsStatus: 'FINAL',
    startTime: '2026-09-20T10:00:00.000Z',
    endTime: '2026-09-20T11:30:00.000Z',
    maxParticipants: 4,
    playersPerMatch: 4,
    minParticipants: 2,
    isPublic: true,
    affectsRating: true,
    allowDirectJoin: false,
    afterGameGoToBar: false,
    suitableForNovices: true,
    ...overrides,
  } as unknown as Game;
}

describe('buildDuplicateGameInitialData', () => {
  /*
   * PRD 360 / plan §5.4 allow-list. "Novices welcome" describes how this
   * organizer runs a game, not what happened in this one, so it rides into the
   * duplicate / "play again" draft — where the organizer can still turn it off
   * before confirming.
   */
  it('copies the novice promise into the draft', () => {
    expect(buildDuplicateGameInitialData(makeGame()).suitableForNovices).toBe(true);
    expect(
      buildDuplicateGameInitialData(makeGame({ suitableForNovices: false })).suitableForNovices,
    ).toBe(false);
  });

  it('leaves it undefined when the source game predates the column', () => {
    const legacy = makeGame();
    delete (legacy as Partial<Game>).suitableForNovices;
    expect(buildDuplicateGameInitialData(legacy).suitableForNovices).toBeUndefined();
  });

  it('never copies the played-out state of the source game', () => {
    const data = buildDuplicateGameInitialData(makeGame()) as Record<string, unknown>;
    for (const key of ['resultsStatus', 'status', 'participants', 'outcomes', 'id']) {
      expect(data[key]).toBeUndefined();
    }
  });
});
