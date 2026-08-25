import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  PODIUM_MIN_PLAYING_PARTICIPANTS,
  getAchievementDefinition,
  habitProgressForDefinition,
  habitUnlocksDue,
  habitUnlocksNewlyCrossed,
  projectTrophyCabinet,
  resolveTrophyShowcase,
  rarityRank,
  meetsPodiumParticipantFloor,
  isPodiumEligibleEntityType,
  groupUserIdsByPodiumPlace,
  ACHIEVEMENT_LEADERBOARD_FAMILIES,
  achievementLeaderboardFamilyForRuleKind,
  isAchievementLeaderboardFamily,
  isLifetimeAchievement,
  isRepeatableAchievement,
} from '@shared/achievements';

describe('achievement catalog', () => {
  it('has podium + habit stubs with rarities and N1 thresholds', () => {
    expect(PODIUM_MIN_PLAYING_PARTICIPANTS).toBe(8);
    expect(ACHIEVEMENT_CATALOG.length).toBeGreaterThanOrEqual(10);

    const gold = getAchievementDefinition('podium_gold');
    const silver = getAchievementDefinition('podium_silver');
    const bronze = getAchievementDefinition('podium_bronze');
    expect(gold?.rarity).toBe('LEGENDARY');
    expect(silver?.rarity).toBe('RARE');
    expect(bronze?.rarity).toBe('RARE');
    expect(gold?.place).toBe(1);
    expect(gold?.type).toBe('REPEATABLE');
    expect(silver?.type).toBe('REPEATABLE');
    expect(bronze?.type).toBe('REPEATABLE');
    expect(gold && isRepeatableAchievement(gold)).toBe(true);

    const streak = [
      'habit_streak_4',
      'habit_streak_8',
      'habit_streak_12',
      'habit_streak_16',
      'habit_streak_32',
      'habit_streak_64',
    ] as const;
    expect(streak.map((id) => getAchievementDefinition(id)?.threshold)).toEqual([
      4, 8, 12, 16, 32, 64,
    ]);
    expect(getAchievementDefinition('habit_streak_4')?.rarity).toBe('COMMON');
    expect(getAchievementDefinition('habit_streak_8')?.rarity).toBe('RARE');
    expect(getAchievementDefinition('habit_streak_64')?.rarity).toBe('LEGENDARY');

    const volume = [
      'habit_games_10',
      'habit_games_50',
      'habit_games_100',
      'habit_games_500',
      'habit_games_1000',
    ] as const;
    expect(volume.map((id) => getAchievementDefinition(id)?.threshold)).toEqual([
      10, 50, 100, 500, 1000,
    ]);
    expect(getAchievementDefinition('habit_games_500')?.rarity).toBe('RARE');
    expect(getAchievementDefinition('habit_games_1000')?.rarity).toBe('LEGENDARY');
    expect(getAchievementDefinition('habit_first_win')?.ruleKind).toBe('HABIT_FIRST_WIN');
    expect(getAchievementDefinition('habit_first_win')?.type).toBe('UNIQUE');
    expect(getAchievementDefinition('habit_first_padel_game')?.ruleKind).toBe('HABIT_SPORT_VOLUME');
    expect(getAchievementDefinition('habit_first_padel_game')?.sport).toBe('PADEL');
    expect(getAchievementDefinition('habit_first_padel_game')?.threshold).toBe(1);
    expect(getAchievementDefinition('habit_first_padel_game')?.type).toBe('UNIQUE');
    expect(getAchievementDefinition('habit_games_10')?.type).toBe('MILESTONE');
    const firstWin = getAchievementDefinition('habit_first_win');
    const games10 = getAchievementDefinition('habit_games_10');
    expect(firstWin && isLifetimeAchievement(firstWin)).toBe(true);
    expect(games10 && isLifetimeAchievement(games10)).toBe(true);

    const wins = [
      'habit_wins_10',
      'habit_wins_25',
      'habit_wins_50',
      'habit_wins_100',
      'habit_wins_500',
    ] as const;
    expect(wins.map((id) => getAchievementDefinition(id)?.threshold)).toEqual([
      10, 25, 50, 100, 500,
    ]);
    expect(getAchievementDefinition('habit_wins_10')?.rarity).toBe('COMMON');
    expect(getAchievementDefinition('habit_wins_25')?.rarity).toBe('COMMON');
    expect(getAchievementDefinition('habit_wins_50')?.rarity).toBe('RARE');
    expect(getAchievementDefinition('habit_wins_100')?.rarity).toBe('RARE');
    expect(getAchievementDefinition('habit_wins_500')?.rarity).toBe('LEGENDARY');
    expect(getAchievementDefinition('habit_wins_10')?.ruleKind).toBe('HABIT_WINS');

    for (const def of ACHIEVEMENT_CATALOG) {
      expect(def.titleKey.startsWith('trophies.')).toBe(true);
      expect(def.descriptionKey.startsWith('trophies.')).toBe(true);
      expect(def.artKey).toBeTruthy();
      expect(def.artKey).toBe(def.id);
      expect(rarityRank(def.rarity)).toBeGreaterThan(0);
    }

    const artKeys = ACHIEVEMENT_CATALOG.map((d) => d.artKey);
    expect(new Set(artKeys).size).toBe(artKeys.length);
  });
});

describe('achievement leaderboard families', () => {
  it('matches the cabinet family grouping', () => {
    expect(achievementLeaderboardFamilyForRuleKind('HABIT_FIRST_WIN')).toBe('HABIT_WINS');
    expect(achievementLeaderboardFamilyForRuleKind('HABIT_SPORT_VOLUME')).toBe('HABIT_VOLUME');
    expect(achievementLeaderboardFamilyForRuleKind('PODIUM')).toBe('PODIUM');
    expect(achievementLeaderboardFamilyForRuleKind('UNKNOWN')).toBeNull();
  });

  it('covers every catalog definition and rejects unknown input', () => {
    for (const definition of ACHIEVEMENT_CATALOG) {
      if (definition.ruleKind === 'EVENT_SEASON') continue;
      if (definition.ruleKind === 'HABIT_BUG_SHIPPED') continue;
      const family = achievementLeaderboardFamilyForRuleKind(definition.ruleKind);
      expect(family).not.toBeNull();
      expect(isAchievementLeaderboardFamily(family)).toBe(true);
    }
    expect(ACHIEVEMENT_LEADERBOARD_FAMILIES).toHaveLength(11);
    expect(isAchievementLeaderboardFamily('HABIT_FIRST_WIN')).toBe(false);
    expect(isAchievementLeaderboardFamily('anything')).toBe(false);
  });
});

describe('projectTrophyCabinet', () => {
  const counters = { streakBest: 2, gamesFinished: 3, gamesWon: 0 };

  it('owner sees full locked catalog when empty', () => {
    const rows = projectTrophyCabinet({ isOwner: true, instances: [], counters });
    const expectedLength = ACHIEVEMENT_CATALOG.filter((d) => d.ruleKind !== 'EVENT_SEASON').length;
    expect(rows).toHaveLength(expectedLength);
    expect(rows.every((r) => !r.unlocked)).toBe(true);
    const streak4 = rows.find((r) => r.definition.id === 'habit_streak_4');
    expect(streak4?.progress).toEqual({ current: 2, target: 4 });
  });

  it('visitor with none sees empty cabinet (no locked graveyard)', () => {
    const rows = projectTrophyCabinet({ isOwner: false, instances: [], counters });
    expect(rows).toEqual([]);
  });

  it('visitor sees only unlocked definitions', () => {
    const rows = projectTrophyCabinet({
      isOwner: false,
      instances: [
        {
          id: 'a1',
          definitionId: 'habit_first_win',
          earnedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      counters,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].definition.id).toBe('habit_first_win');
    expect(rows[0].unlocked).toBe(true);
  });
});

describe('resolveTrophyShowcase', () => {
  it('auto-picks newest then rarest; pins override', () => {
    const instances = [
      {
        id: 'common-old',
        definitionId: 'habit_games_10' as const,
        earnedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'gold-mid',
        definitionId: 'podium_gold' as const,
        earnedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'rare-new',
        definitionId: 'habit_streak_8' as const,
        earnedAt: '2026-03-01T00:00:00.000Z',
      },
    ];
    const auto = resolveTrophyShowcase({ instances, pins: [] });
    expect(auto.map((s) => s.instance?.id)).toEqual(['rare-new', 'gold-mid', 'common-old']);
    expect(auto.every((s) => !s.pinned)).toBe(true);

    const pinned = resolveTrophyShowcase({
      instances,
      pins: [{ slot: 0, achievementId: 'common-old' }],
    });
    expect(pinned[0].instance?.id).toBe('common-old');
    expect(pinned[0].pinned).toBe(true);
    expect(pinned[1].instance?.id).toBe('rare-new');
    expect(pinned[1].pinned).toBe(false);
  });

  it('fills remaining slots with auto when pins are partial, placing pinned items first', () => {
    const instances = [
      {
        id: 'a',
        definitionId: 'habit_first_win' as const,
        earnedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        definitionId: 'habit_games_10' as const,
        earnedAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'c',
        definitionId: 'podium_gold' as const,
        earnedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'd',
        definitionId: 'habit_streak_8' as const,
        earnedAt: '2026-04-01T00:00:00.000Z',
      },
    ];
    const slots = resolveTrophyShowcase({
      instances,
      pins: [{ slot: 2, achievementId: 'a' }],
    });
    expect(slots[0].instance?.id).toBe('a');
    expect(slots[0].pinned).toBe(true);
    expect(slots[1].instance?.id).toBe('d');
    expect(slots[1].pinned).toBe(false);
    expect(slots[2].instance?.id).toBe('c');
    expect(slots[2].pinned).toBe(false);
  });

  it('ignores pins for unknown or duplicate instances', () => {
    const instances = [
      {
        id: 'only',
        definitionId: 'habit_first_win' as const,
        earnedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const slots = resolveTrophyShowcase({
      instances,
      pins: [
        { slot: 0, achievementId: 'missing' },
        { slot: 1, achievementId: 'only' },
        { slot: 2, achievementId: 'only' },
      ],
    });
    expect(slots[0].instance?.id).toBe('only');
    expect(slots[0].pinned).toBe(true);
    expect(slots[1].instance).toBeNull();
    expect(slots[2].instance).toBeNull();
  });

  it('groups repeatable achievement instances per definitionId (e.g. 2 gold + 1 silver -> 2 slots)', () => {
    const instances = [
      {
        id: 'gold-1',
        definitionId: 'podium_gold' as const,
        earnedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'gold-2',
        definitionId: 'podium_gold' as const,
        earnedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        id: 'silver-1',
        definitionId: 'podium_silver' as const,
        earnedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    const slots = resolveTrophyShowcase({ instances, pins: [] });
    expect(slots[0].definitionId).toBe('podium_gold');
    expect(slots[0].instances).toHaveLength(2);
    expect(slots[0].instance?.id).toBe('gold-1');

    expect(slots[1].definitionId).toBe('podium_silver');
    expect(slots[1].instances).toHaveLength(1);
    expect(slots[1].instance?.id).toBe('silver-1');

    expect(slots[2].instance).toBeNull();
  });

  it('empty instances yield empty showcase slots', () => {
    const slots = resolveTrophyShowcase({ instances: [], pins: [] });
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.instance == null)).toBe(true);
  });
});

describe('decidePinSlot', () => {
  it('inserts into first free slot and refuses when full', async () => {
    const { decidePinSlot } = await import('@shared/achievements');
    expect(decidePinSlot({ existingPins: [], achievementId: 'x' })).toEqual({
      type: 'insert',
      slot: 0,
    });
    expect(
      decidePinSlot({
        existingPins: [
          { slot: 0, achievementId: 'a' },
          { slot: 1, achievementId: 'b' },
          { slot: 2, achievementId: 'c' },
        ],
        achievementId: 'd',
      }),
    ).toEqual({ type: 'full' });
    expect(
      decidePinSlot({
        existingPins: [{ slot: 0, achievementId: 'a' }],
        achievementId: 'a',
      }),
    ).toEqual({ type: 'already', slot: 0 });
  });
});

describe('habitProgressForDefinition', () => {
  it('caps current at target', () => {
    const def = getAchievementDefinition('habit_games_10')!;
    expect(habitProgressForDefinition(def, { streakBest: 0, gamesFinished: 99, gamesWon: 0 })).toEqual({
      current: 10,
      target: 10,
    });
  });
});

describe('habitUnlocksDue', () => {
  it('grants volume and first-win at thresholds once', () => {
    expect(
      habitUnlocksDue({
        counters: { streakBest: 0, gamesFinished: 9, gamesWon: 0 },
        ownedDefinitionIds: new Set(),
      }),
    ).toHaveLength(0);

    expect(
      habitUnlocksDue({
        counters: { streakBest: 0, gamesFinished: 10, gamesWon: 1 },
        ownedDefinitionIds: new Set(),
      }).map((d) => d.id),
    ).toEqual(['habit_first_win', 'habit_games_10']);

    expect(
      habitUnlocksDue({
        counters: { streakBest: 0, gamesFinished: 10, gamesWon: 1 },
        ownedDefinitionIds: new Set(['habit_first_win', 'habit_games_10']),
      }),
    ).toHaveLength(0);
  });

  it('grants win milestones at 10 / 25 / 50 / 100 / 500', () => {
    expect(
      habitUnlocksDue({
        counters: { streakBest: 0, gamesFinished: 0, gamesWon: 9 },
        ownedDefinitionIds: new Set(['habit_first_win']),
      }),
    ).toHaveLength(0);

    expect(
      habitUnlocksDue({
        counters: { streakBest: 0, gamesFinished: 0, gamesWon: 10 },
        ownedDefinitionIds: new Set(['habit_first_win']),
      }).map((d) => d.id),
    ).toEqual(['habit_wins_10']);

    expect(
      habitUnlocksDue({
        counters: { streakBest: 0, gamesFinished: 0, gamesWon: 500 },
        ownedDefinitionIds: new Set([
          'habit_first_win',
          'habit_wins_10',
          'habit_wins_25',
          'habit_wins_50',
          'habit_wins_100',
        ]),
      }).map((d) => d.id),
    ).toEqual(['habit_wins_500']);
  });

  it('grants first padel game from PADEL sport volume only', () => {
    expect(
      habitUnlocksDue({
        counters: {
          streakBest: 0,
          gamesFinished: 5,
          gamesWon: 0,
          gamesFinishedBySport: { TENNIS: 5 },
        },
        ownedDefinitionIds: new Set(),
      }).map((d) => d.id),
    ).not.toContain('habit_first_padel_game');

    expect(
      habitUnlocksDue({
        counters: {
          streakBest: 0,
          gamesFinished: 1,
          gamesWon: 0,
          gamesFinishedBySport: { PADEL: 1 },
        },
        ownedDefinitionIds: new Set(),
      }).map((d) => d.id),
    ).toContain('habit_first_padel_game');
  });

  it('grants streak milestones at 4 / 8 / 12 / 16 / 32 / 64', () => {
    expect(
      habitUnlocksDue({
        counters: { streakBest: 4, gamesFinished: 0, gamesWon: 0 },
        ownedDefinitionIds: new Set(),
      }).map((d) => d.id),
    ).toEqual(['habit_streak_4']);

    expect(
      habitUnlocksDue({
        counters: { streakBest: 12, gamesFinished: 0, gamesWon: 0 },
        ownedDefinitionIds: new Set(['habit_streak_4']),
      }).map((d) => d.id),
    ).toEqual(['habit_streak_8', 'habit_streak_12']);

    expect(
      habitUnlocksDue({
        counters: { streakBest: 64, gamesFinished: 0, gamesWon: 0 },
        ownedDefinitionIds: new Set([
          'habit_streak_4',
          'habit_streak_8',
          'habit_streak_12',
          'habit_streak_16',
          'habit_streak_32',
        ]),
      }).map((d) => d.id),
    ).toEqual(['habit_streak_64']);
  });
});

describe('habitUnlocksNewlyCrossed', () => {
  it('requires before→after crossing (no historical soft backfill)', () => {
    expect(
      habitUnlocksNewlyCrossed({
        before: { streakBest: 12, gamesFinished: 100, gamesWon: 40 },
        after: { streakBest: 12, gamesFinished: 101, gamesWon: 41 },
        ownedDefinitionIds: new Set(),
      }),
    ).toHaveLength(0);

    expect(
      habitUnlocksNewlyCrossed({
        before: { streakBest: 3, gamesFinished: 9, gamesWon: 0 },
        after: { streakBest: 4, gamesFinished: 10, gamesWon: 1 },
        ownedDefinitionIds: new Set(),
      }).map((d) => d.id),
    ).toEqual(['habit_first_win', 'habit_games_10', 'habit_streak_4']);
  });

  it('never grants organize/partner via play-habit path', () => {
    const ids = habitUnlocksNewlyCrossed({
      before: {
        streakBest: 0,
        gamesFinished: 0,
        gamesWon: 0,
        organizedGames: 0,
        giantKillerWins: 0,
        tieBreakSetWins: 0,
      },
      after: {
        streakBest: 0,
        gamesFinished: 0,
        gamesWon: 0,
        organizedGames: 50,
        giantKillerWins: 25,
        tieBreakSetWins: 64,
      },
      ownedDefinitionIds: new Set(),
    }).map((d) => d.id);
    expect(ids).toEqual([]);
  });
});

describe('habitUnlocksDue organize backfill', () => {
  it('includes organize when counters meet threshold', () => {
    const ids = habitUnlocksDue({
      counters: {
        streakBest: 0,
        gamesFinished: 0,
        gamesWon: 0,
        organizedGames: 1,
      },
      ownedDefinitionIds: new Set(),
    }).map((d) => d.id);
    expect(ids).toContain('habit_org_game_1');
    expect(ids.every((id) => !id.startsWith('habit_games_'))).toBe(true);
  });

  it('includes tie-break when counters meet threshold', () => {
    const ids = habitUnlocksDue({
      counters: {
        streakBest: 0,
        gamesFinished: 0,
        gamesWon: 0,
        tieBreakSetWins: 32,
      },
      ownedDefinitionIds: new Set(),
    }).map((d) => d.id);
    expect(ids).toEqual([
      'habit_tie_break_1',
      'habit_tie_break_5',
      'habit_tie_break_12',
      'habit_tie_break_32',
    ]);
  });
});

describe('podium eligibility', () => {
  it('enforces N≥8 floor and entity rules', async () => {
    const {
      meetsPodiumParticipantFloor,
      isPodiumEligibleEntityType,
      groupUserIdsByPodiumPlace,
    } = await import('@shared/achievements');
    expect(meetsPodiumParticipantFloor(7)).toBe(false);
    expect(meetsPodiumParticipantFloor(8)).toBe(true);
    expect(isPodiumEligibleEntityType('TOURNAMENT', null)).toBe(true);
    expect(isPodiumEligibleEntityType('LEAGUE', 'parent')).toBe(false);
    expect(groupUserIdsByPodiumPlace([{ userId: 'u1', position: 1 }]).get(1)).toEqual(['u1']);
  });
});

describe('podiumEligibility', () => {
  it('enforces N=8 floor and eligible entity types', () => {
    expect(meetsPodiumParticipantFloor(7)).toBe(false);
    expect(meetsPodiumParticipantFloor(8)).toBe(true);
    expect(isPodiumEligibleEntityType('TOURNAMENT', null)).toBe(true);
    expect(isPodiumEligibleEntityType('LEAGUE_SEASON', null)).toBe(true);
    expect(isPodiumEligibleEntityType('LEAGUE', null)).toBe(true);
    expect(isPodiumEligibleEntityType('LEAGUE', 'parent-season')).toBe(false);
    expect(isPodiumEligibleEntityType('GAME', null)).toBe(false);
  });

  it('uses bracket places for every event tree (per-group podium)', async () => {
    const {
      usesBracketPlacesForEventPodium,
      treeKeysForBracketPodium,
      finalistFromChampionshipSides,
      mergeTreePodiumsIntoEventPlaces,
    } = await import('@shared/achievements');
    expect(usesBracketPlacesForEventPodium('CROSS_GROUP', 3)).toBe(true);
    expect(usesBracketPlacesForEventPodium('PER_GROUP', 1)).toBe(true);
    expect(usesBracketPlacesForEventPodium('PER_GROUP', 2)).toBe(true);
    expect(usesBracketPlacesForEventPodium('PER_GROUP', 3)).toBe(true);

    // Season-wide tree vs per-group trees.
    expect(treeKeysForBracketPodium('CROSS_GROUP', ['a', 'b'])).toEqual([null]);
    expect(treeKeysForBracketPodium('PER_GROUP', ['a', 'b'])).toEqual(['a', 'b']);

    // Finalist = non-champion side of the final.
    expect(finalistFromChampionshipSides('w', 'w', 'l')).toBe('l');
    expect(finalistFromChampionshipSides('l', 'w', 'l')).toBe('w');

    // Season-wide: one finalist.
    const season = mergeTreePodiumsIntoEventPlaces([
      {
        championParticipantId: 'sc',
        finalistParticipantId: 'sf',
        thirdPlaceParticipantId: 'st',
      },
    ]);
    expect(season.get(2)).toEqual(['sf']);

    // Per-group multi: independent finalists (silver bag has both).
    const multi = mergeTreePodiumsIntoEventPlaces([
      { championParticipantId: 'c1', finalistParticipantId: 'f1' },
      { championParticipantId: 'c2', finalistParticipantId: 'f2' },
    ]);
    expect(multi.get(1)).toEqual(['c1', 'c2']);
    expect(multi.get(2)).toEqual(['f1', 'f2']);
  });

  it('groups outcome positions into podium places', () => {
    const map = groupUserIdsByPodiumPlace([
      { userId: 'a', position: 1 },
      { userId: 'b', position: 2 },
      { userId: 'c', position: 2 },
      { userId: 'd', position: 4 },
      { userId: 'e', position: null },
    ]);
    expect(map.get(1)).toEqual(['a']);
    expect(map.get(2)).toEqual(['b', 'c']);
    expect(map.get(3)).toBeUndefined();
  });
});
