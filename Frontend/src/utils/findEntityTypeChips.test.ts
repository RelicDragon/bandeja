import { describe, expect, it } from 'vitest';
import {
  countActiveFindEntityChips,
  gameMatchesFindEntityChips,
  resolveFindEntityTypesParam,
  toggleFindEntityChip,
} from './findEntityTypeChips';

const none = {
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  eventsFilter: false,
};

describe('findEntityTypeChips', () => {
  it('excludes EVENT when no chip is on', () => {
    expect(gameMatchesFindEntityChips('GAME', none)).toBe(true);
    expect(gameMatchesFindEntityChips('BAR', none)).toBe(true);
    expect(gameMatchesFindEntityChips('LEAGUE_SEASON', none)).toBe(true);
    expect(gameMatchesFindEntityChips('EVENT', none)).toBe(false);
    expect(resolveFindEntityTypesParam(none)).toBeUndefined();
  });

  it('includes EVENT when no chip is on and calendar idle includes events', () => {
    expect(gameMatchesFindEntityChips('EVENT', none, { idleIncludesEvent: true })).toBe(true);
    expect(gameMatchesFindEntityChips('GAME', none, { idleIncludesEvent: true })).toBe(true);
  });

  it('includes EVENT when events chip is on', () => {
    const state = { ...none, eventsFilter: true };
    expect(gameMatchesFindEntityChips('EVENT', state)).toBe(true);
    expect(gameMatchesFindEntityChips('GAME', state)).toBe(false);
    expect(resolveFindEntityTypesParam(state)).toBe('EVENT');
  });

  it('ORs selected chips and maps LEAGUE_SEASON to leagues', () => {
    const state = { ...none, gameFilter: true, leaguesFilter: true };
    expect(gameMatchesFindEntityChips('GAME', state)).toBe(true);
    expect(gameMatchesFindEntityChips('LEAGUE', state)).toBe(true);
    expect(gameMatchesFindEntityChips('LEAGUE_SEASON', state)).toBe(true);
    expect(gameMatchesFindEntityChips('TRAINING', state)).toBe(false);
    expect(gameMatchesFindEntityChips('TOURNAMENT', state)).toBe(false);
    expect(gameMatchesFindEntityChips('BAR', state)).toBe(false);
    expect(gameMatchesFindEntityChips('EVENT', state)).toBe(false);
    expect(resolveFindEntityTypesParam(state)).toBe('GAME,LEAGUE');
  });

  it('unions EVENT with other chips', () => {
    const state = { ...none, gameFilter: true, eventsFilter: true };
    expect(gameMatchesFindEntityChips('GAME', state)).toBe(true);
    expect(gameMatchesFindEntityChips('EVENT', state)).toBe(true);
    expect(gameMatchesFindEntityChips('TRAINING', state)).toBe(false);
    expect(resolveFindEntityTypesParam(state)).toBe('GAME,EVENT');
  });

  it('joins selected types in stable API order', () => {
    expect(
      resolveFindEntityTypesParam({
        leaguesFilter: true,
        tournamentFilter: true,
        trainingFilter: true,
        gameFilter: true,
        eventsFilter: true,
      }),
    ).toBe('GAME,TRAINING,TOURNAMENT,LEAGUE,EVENT');
  });

  it('toggles one chip without clearing others', () => {
    const first = toggleFindEntityChip(none, 'game');
    const second = toggleFindEntityChip(first, 'tournament');
    expect(second).toEqual({
      gameFilter: true,
      trainingFilter: false,
      tournamentFilter: true,
      leaguesFilter: false,
      eventsFilter: false,
    });
    expect(countActiveFindEntityChips(second)).toBe(2);
    expect(toggleFindEntityChip(second, 'game').gameFilter).toBe(false);
    expect(toggleFindEntityChip(none, 'events').eventsFilter).toBe(true);
  });
});
