import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  filterOrganizeDefinitionsDue,
  gameQualifiesForOrganizeHabit,
} from '@shared/achievements';

describe('organizeEligibility', () => {
  it('requires rated padel for games/tournaments; BAR ignores sport/rating', () => {
    expect(
      gameQualifiesForOrganizeHabit({
        entityType: 'GAME',
        sport: 'PADEL',
        affectsRating: true,
        kind: 'GAME',
      }),
    ).toBe(true);
    expect(
      gameQualifiesForOrganizeHabit({
        entityType: 'GAME',
        sport: 'PADEL',
        affectsRating: false,
        kind: 'GAME',
      }),
    ).toBe(false);
    expect(
      gameQualifiesForOrganizeHabit({
        entityType: 'GAME',
        sport: 'TENNIS',
        affectsRating: true,
        kind: 'GAME',
      }),
    ).toBe(false);
    expect(
      gameQualifiesForOrganizeHabit({
        entityType: 'TOURNAMENT',
        sport: 'PADEL',
        affectsRating: true,
        kind: 'TOURNAMENT',
      }),
    ).toBe(true);
    expect(
      gameQualifiesForOrganizeHabit({
        entityType: 'BAR',
        sport: 'TENNIS',
        affectsRating: false,
        kind: 'BAR',
      }),
    ).toBe(true);
  });

  it('crosses organize thresholds forward-only', () => {
    const due = filterOrganizeDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      kind: 'GAME',
      before: 9,
      after: 10,
      ownedDefinitionIds: new Set(['habit_org_game_1']),
    }).map((d) => d.id);
    expect(due).toEqual(['habit_org_game_10']);

    const bar = filterOrganizeDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      kind: 'BAR',
      before: 24,
      after: 25,
      ownedDefinitionIds: new Set(),
    }).map((d) => d.id);
    expect(bar).toEqual(['habit_org_bar_25']);

    const catchUp = filterOrganizeDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      kind: 'BAR',
      before: 0,
      after: 25,
      ownedDefinitionIds: new Set(),
    }).map((d) => d.id);
    expect(catchUp).toEqual([
      'habit_org_bar_1',
      'habit_org_bar_5',
      'habit_org_bar_10',
      'habit_org_bar_25',
    ]);
  });
});
