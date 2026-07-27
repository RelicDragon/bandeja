import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  accumulatePartnerCountersForUser,
  filterThresholdDefinitionsDue,
  GIANT_KILLER_MIN_LEVEL_GAP,
  GIANT_KILLER_MIN_RELIABILITY,
} from '@shared/achievements';

describe('partner achievements', () => {
  it('catalog thresholds and rarities', () => {
    const gk = ACHIEVEMENT_CATALOG.filter((d) => d.ruleKind === 'HABIT_GIANT_KILLER');
    expect(gk.map((d) => [d.threshold, d.rarity])).toEqual([
      [1, 'COMMON'],
      [5, 'COMMON'],
      [10, 'RARE'],
      [25, 'RARE'],
      [50, 'LEGENDARY'],
    ]);
    const duo = ACHIEVEMENT_CATALOG.filter((d) => d.ruleKind === 'HABIT_DYNAMIC_DUO');
    expect(duo.map((d) => [d.threshold, d.rarity])).toEqual([
      [10, 'COMMON'],
      [50, 'RARE'],
      [100, 'LEGENDARY'],
    ]);
    const open = ACHIEVEMENT_CATALOG.filter((d) => d.ruleKind === 'HABIT_OPEN_COURT');
    expect(open.map((d) => [d.threshold, d.rarity])).toEqual([
      [10, 'COMMON'],
      [25, 'COMMON'],
      [50, 'RARE'],
      [100, 'RARE'],
      [250, 'LEGENDARY'],
    ]);
  });

  it('crosses giant killer thresholds forward-only', () => {
    const due = filterThresholdDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      ruleKind: 'HABIT_GIANT_KILLER',
      before: 4,
      after: 5,
      ownedDefinitionIds: new Set(['habit_giant_killer_1']),
    }).map((d) => d.id);
    expect(due).toEqual(['habit_giant_killer_5']);
  });

  it('counts upset win, duo wins, and unique partners from doubles matches', () => {
    expect(GIANT_KILLER_MIN_LEVEL_GAP).toBe(0.5);
    expect(GIANT_KILLER_MIN_RELIABILITY).toBe(10);

    const counters = accumulatePartnerCountersForUser(
      [
        {
          players: [
            { userId: 'u1', level: 3.0, reliability: 40 },
            { userId: 'u2', level: 3.0, reliability: 40 },
            { userId: 'u3', level: 4.0, reliability: 40 },
            { userId: 'u4', level: 4.0, reliability: 40 },
            { userId: 'u5', level: 3.2, reliability: 40 },
          ],
          matches: [
            {
              winnerId: 'tA',
              teams: [
                { id: 'tA', teamNumber: 1, playerIds: ['u1', 'u2'] },
                { id: 'tB', teamNumber: 2, playerIds: ['u3', 'u4'] },
              ],
            },
            {
              winnerId: 'tC',
              teams: [
                { id: 'tC', teamNumber: 1, playerIds: ['u1', 'u2'] },
                { id: 'tD', teamNumber: 2, playerIds: ['u3', 'u5'] },
              ],
            },
            {
              winnerId: 'tE',
              teams: [
                { id: 'tE', teamNumber: 1, playerIds: ['u1', 'u5'] },
                { id: 'tF', teamNumber: 2, playerIds: ['u3', 'u4'] },
              ],
            },
          ],
        },
      ],
      'u1',
    );

    expect(counters.giantKillerWins).toBe(3);
    expect(counters.dynamicDuoMaxWins).toBe(2);
    expect(counters.openCourtPartners).toBe(2);
  });

  it('rejects giant killer when reliability too low', () => {
    const counters = accumulatePartnerCountersForUser(
      [
        {
          players: [
            { userId: 'u1', level: 3.0, reliability: 40 },
            { userId: 'u2', level: 3.0, reliability: 40 },
            { userId: 'u3', level: 4.0, reliability: 5 },
            { userId: 'u4', level: 4.0, reliability: 40 },
          ],
          matches: [
            {
              winnerId: 'tA',
              teams: [
                { id: 'tA', teamNumber: 1, playerIds: ['u1', 'u2'] },
                { id: 'tB', teamNumber: 2, playerIds: ['u3', 'u4'] },
              ],
            },
          ],
        },
      ],
      'u1',
    );
    expect(counters.giantKillerWins).toBe(0);
    expect(counters.dynamicDuoMaxWins).toBe(1);
    expect(counters.openCourtPartners).toBe(1);
  });

  it('counts Open Court partners on completed ties without a winner', () => {
    const counters = accumulatePartnerCountersForUser(
      [
        {
          players: [
            { userId: 'u1', level: 3.0, reliability: 40 },
            { userId: 'u2', level: 3.0, reliability: 40 },
            { userId: 'u3', level: 3.0, reliability: 40 },
            { userId: 'u4', level: 3.0, reliability: 40 },
          ],
          matches: [
            {
              winnerId: null,
              played: true,
              teams: [
                { id: 'tA', teamNumber: 1, playerIds: ['u1', 'u2'] },
                { id: 'tB', teamNumber: 2, playerIds: ['u3', 'u4'] },
              ],
            },
          ],
        },
      ],
      'u1',
    );
    expect(counters.openCourtPartners).toBe(1);
    expect(counters.dynamicDuoMaxWins).toBe(0);
    expect(counters.giantKillerWins).toBe(0);
  });
});
