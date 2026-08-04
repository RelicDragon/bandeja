import { describe, expect, it } from 'vitest';
import {
  groupCabinetRailItems,
  isCatalogFamilyMaxLevel,
  isMaxLevelEntry,
  nextChaseEntry,
  sortFamilyStackEntries,
  sortStackEntries,
} from '@/components/trophies/cabinetGrouping';
import type { TrophyCabinetEntryView, TrophyDefinitionView } from '@/types/trophies';

function def(
  partial: Partial<TrophyDefinitionView> & Pick<TrophyDefinitionView, 'id' | 'ruleKind'>,
): TrophyDefinitionView {
  return {
    rarity: 'COMMON',
    artKey: partial.id,
    titleKey: `trophies.defs.${partial.id}.title`,
    descriptionKey: `trophies.defs.${partial.id}.description`,
    type: 'MILESTONE',
    ...partial,
  };
}

function entry(
  definition: TrophyDefinitionView,
  unlocked: boolean,
  opts?: { earnedAt?: string; progress?: { current: number; target: number } },
): TrophyCabinetEntryView {
  return {
    definition,
    unlocked,
    instances: unlocked
      ? [
          {
            id: `i-${definition.id}`,
            definitionId: definition.id,
            earnedAt: opts?.earnedAt ?? '2026-01-01T00:00:00.000Z',
            sport: null,
            place: null,
            source: null,
          },
        ]
      : [],
    progress: opts?.progress ?? null,
  };
}

describe('sortStackEntries', () => {
  it('orders volume habits best → worst (leftmost / pile top first)', () => {
    const sorted = sortStackEntries([
      entry(def({ id: 'habit_games_1000', ruleKind: 'HABIT_VOLUME', threshold: 1000, rarity: 'LEGENDARY' }), true),
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
      entry(def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500, rarity: 'RARE' }), true),
    ]);
    expect(sorted.map((e) => e.definition.id)).toEqual([
      'habit_games_1000',
      'habit_games_500',
      'habit_games_10',
    ]);
  });

  it('orders podium gold → bronze (gold first)', () => {
    const sorted = sortStackEntries([
      entry(def({ id: 'podium_gold', ruleKind: 'PODIUM', place: 1, rarity: 'LEGENDARY' }), true),
      entry(def({ id: 'podium_bronze', ruleKind: 'PODIUM', place: 3, rarity: 'RARE' }), true),
      entry(def({ id: 'podium_silver', ruleKind: 'PODIUM', place: 2, rarity: 'RARE' }), true),
    ]);
    expect(sorted.map((e) => e.definition.id)).toEqual([
      'podium_gold',
      'podium_silver',
      'podium_bronze',
    ]);
  });
});

describe('sortFamilyStackEntries', () => {
  it('orders low → max for expand left → right', () => {
    const sorted = sortFamilyStackEntries([
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
      entry(def({ id: 'habit_games_50', ruleKind: 'HABIT_VOLUME', threshold: 50 }), true),
      entry(
        def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500 }),
        false,
        { progress: { current: 120, target: 500 } },
      ),
      entry(
        def({ id: 'habit_games_1000', ruleKind: 'HABIT_VOLUME', threshold: 1000 }),
        false,
        { progress: { current: 120, target: 1000 } },
      ),
    ]);
    expect(sorted.map((e) => e.definition.id)).toEqual([
      'habit_games_10',
      'habit_games_50',
      'habit_games_500',
      'habit_games_1000',
    ]);
  });
});

describe('nextChaseEntry', () => {
  it('picks the easiest locked level', () => {
    const chase = nextChaseEntry([
      entry(def({ id: 'habit_games_50', ruleKind: 'HABIT_VOLUME', threshold: 50 }), true),
      entry(
        def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500 }),
        false,
        { progress: { current: 120, target: 500 } },
      ),
      entry(
        def({ id: 'habit_games_1000', ruleKind: 'HABIT_VOLUME', threshold: 1000 }),
        false,
        { progress: { current: 120, target: 1000 } },
      ),
    ]);
    expect(chase?.definition.id).toBe('habit_games_500');
  });

  it('returns null when max level is reached', () => {
    expect(
      nextChaseEntry([
        entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
        entry(def({ id: 'habit_games_50', ruleKind: 'HABIT_VOLUME', threshold: 50 }), true),
      ]),
    ).toBeNull();
  });

  it('detects the max level entry in a family', () => {
    const rows = [
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
      entry(def({ id: 'habit_games_1000', ruleKind: 'HABIT_VOLUME', threshold: 1000 }), false),
      entry(def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500 }), false),
    ];
    expect(isMaxLevelEntry(rows[1]!, rows)).toBe(true);
    expect(isMaxLevelEntry(rows[2]!, rows)).toBe(false);
  });

  it('resolves catalog family max by score, not rarity alone', () => {
    expect(
      isCatalogFamilyMaxLevel({
        id: 'habit_wins_500',
        type: 'MILESTONE',
        ruleKind: 'HABIT_WINS',
        threshold: 500,
      }),
    ).toBe(true);
    expect(
      isCatalogFamilyMaxLevel({
        id: 'habit_wins_100',
        type: 'MILESTONE',
        ruleKind: 'HABIT_WINS',
        threshold: 100,
      }),
    ).toBe(false);
    expect(
      isCatalogFamilyMaxLevel({
        id: 'podium_gold',
        type: 'REPEATABLE',
        ruleKind: 'PODIUM',
        place: 1,
      }),
    ).toBe(true);
    expect(
      isCatalogFamilyMaxLevel({
        id: 'podium_silver',
        type: 'REPEATABLE',
        ruleKind: 'PODIUM',
        place: 2,
      }),
    ).toBe(true);
  });
});

describe('groupCabinetRailItems', () => {
  it('keeps a unique padel debut separate from the volume milestone ladder', () => {
    const items = groupCabinetRailItems([
      entry(
        def({
          id: 'habit_first_padel_game',
          type: 'UNIQUE',
          ruleKind: 'HABIT_SPORT_VOLUME',
          threshold: 1,
        }),
        true,
      ),
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
      entry(def({ id: 'habit_games_50', ruleKind: 'HABIT_VOLUME', threshold: 50 }), true),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'stack', unlocked: true, ruleKind: 'HABIT_VOLUME' });
    if (items[0]?.kind === 'stack') {
      expect(items[0].entries.map((e) => e.definition.id)).toEqual([
        'habit_games_10',
        'habit_games_50',
      ]);
    }
    expect(items[1]).toMatchObject({
      kind: 'card',
      entry: { definition: { id: 'habit_first_padel_game' } },
    });
  });

  it('keeps a single entry as a card', () => {
    const items = groupCabinetRailItems([
      entry(def({ id: 'habit_first_win', ruleKind: 'HABIT_FIRST_WIN' }), true),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('card');
  });

  it('keeps a unique first win separate from the wins milestone ladder', () => {
    const items = groupCabinetRailItems([
      entry(def({ id: 'habit_first_win', type: 'UNIQUE', ruleKind: 'HABIT_FIRST_WIN', threshold: 1 }), true),
      entry(def({ id: 'habit_wins_10', ruleKind: 'HABIT_WINS', threshold: 10 }), true),
      entry(def({ id: 'habit_wins_25', ruleKind: 'HABIT_WINS', threshold: 25 }), true),
      entry(
        def({ id: 'habit_wins_50', ruleKind: 'HABIT_WINS', threshold: 50, rarity: 'RARE' }),
        false,
        { progress: { current: 30, target: 50 } },
      ),
    ]);
    expect(items.map((i) => i.kind)).toEqual(['stack', 'card', 'card']);
    expect(items[0]).toMatchObject({ kind: 'stack', unlocked: true, ruleKind: 'HABIT_WINS' });
    if (items[0]?.kind === 'stack') {
      expect(items[0].entries.map((e) => e.definition.id)).toEqual([
        'habit_wins_10',
        'habit_wins_25',
      ]);
    }
    expect(items.slice(1).map((item) => item.key).sort()).toEqual([
      'habit_first_win',
      'habit_wins_50',
    ]);
  });

  it('stacks unlocked habit_games separately from locked by default', () => {
    const unlocked10 = entry(
      def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }),
      true,
      { earnedAt: '2026-02-01T00:00:00.000Z' },
    );
    const unlocked50 = entry(
      def({ id: 'habit_games_50', ruleKind: 'HABIT_VOLUME', threshold: 50 }),
      true,
      { earnedAt: '2026-03-01T00:00:00.000Z' },
    );
    const locked500 = entry(
      def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500, rarity: 'RARE' }),
      false,
      { progress: { current: 120, target: 500 } },
    );
    const locked1000 = entry(
      def({
        id: 'habit_games_1000',
        ruleKind: 'HABIT_VOLUME',
        threshold: 1000,
        rarity: 'LEGENDARY',
      }),
      false,
      { progress: { current: 120, target: 1000 } },
    );

    const items = groupCabinetRailItems([unlocked10, unlocked50, locked500, locked1000]);
    expect(items.map((i) => i.kind)).toEqual(['stack', 'stack']);
    expect(items[0]).toMatchObject({ kind: 'stack', unlocked: true, ruleKind: 'HABIT_VOLUME' });
    expect(items[1]).toMatchObject({ kind: 'stack', unlocked: false, ruleKind: 'HABIT_VOLUME' });
    if (items[0]?.kind === 'stack') {
      expect(items[0].entries.map((e) => e.definition.id)).toEqual([
        'habit_games_10',
        'habit_games_50',
      ]);
    }
  });

  it('merges locked and unlocked into one family stack for own cabinet', () => {
    const unlocked10 = entry(
      def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }),
      true,
      { earnedAt: '2026-02-01T00:00:00.000Z' },
    );
    const unlocked50 = entry(
      def({ id: 'habit_games_50', ruleKind: 'HABIT_VOLUME', threshold: 50 }),
      true,
      { earnedAt: '2026-03-01T00:00:00.000Z' },
    );
    const locked500 = entry(
      def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500, rarity: 'RARE' }),
      false,
      { progress: { current: 120, target: 500 } },
    );
    const locked1000 = entry(
      def({
        id: 'habit_games_1000',
        ruleKind: 'HABIT_VOLUME',
        threshold: 1000,
        rarity: 'LEGENDARY',
      }),
      false,
      { progress: { current: 120, target: 1000 } },
    );

    const items = groupCabinetRailItems(
      [unlocked10, unlocked50, locked500, locked1000],
      { mergeLockState: true },
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'stack',
      unlocked: true,
      ruleKind: 'HABIT_VOLUME',
      key: 'HABIT_VOLUME',
    });
    if (items[0]?.kind === 'stack') {
      expect(items[0].entries.map((e) => e.definition.id)).toEqual([
        'habit_games_10',
        'habit_games_50',
        'habit_games_500',
        'habit_games_1000',
      ]);
      expect(nextChaseEntry(items[0].entries)?.definition.id).toBe('habit_games_500');
    }
  });

  it('does not merge a unique first win into the wins ladder for own cabinet', () => {
    const items = groupCabinetRailItems(
      [
        entry(def({ id: 'habit_first_win', type: 'UNIQUE', ruleKind: 'HABIT_FIRST_WIN', threshold: 1 }), true),
        entry(def({ id: 'habit_wins_10', ruleKind: 'HABIT_WINS', threshold: 10 }), true),
        entry(
          def({ id: 'habit_wins_50', ruleKind: 'HABIT_WINS', threshold: 50, rarity: 'RARE' }),
          false,
          { progress: { current: 30, target: 50 } },
        ),
      ],
      { mergeLockState: true },
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'stack', unlocked: true, ruleKind: 'HABIT_WINS' });
    if (items[0]?.kind === 'stack') {
      expect(items[0].entries.map((e) => e.definition.id)).toEqual([
        'habit_wins_10',
        'habit_wins_50',
      ]);
    }
    expect(items[1]).toMatchObject({
      kind: 'card',
      entry: { definition: { id: 'habit_first_win' } },
    });
  });

  it('shows repeatable podium medals as separate counted cards', () => {
    const gold = entry(
      def({ id: 'podium_gold', type: 'REPEATABLE', ruleKind: 'PODIUM', place: 1 }),
      true,
    );
    gold.instances = [
      { ...gold.instances[0]!, id: 'gold-1' },
      { ...gold.instances[0]!, id: 'gold-2' },
      { ...gold.instances[0]!, id: 'gold-3' },
    ];
    const silver = entry(
      def({ id: 'podium_silver', type: 'REPEATABLE', ruleKind: 'PODIUM', place: 2 }),
      true,
    );

    const items = groupCabinetRailItems([silver, gold], { mergeLockState: true });

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === 'card')).toBe(true);
    expect(items.map((item) => item.key)).toEqual(['podium_gold', 'podium_silver']);
    if (items[0]?.kind === 'card' && items[1]?.kind === 'card') {
      expect(items[0].entry.instances).toHaveLength(3);
      expect(items[1].entry.instances).toHaveLength(1);
    }
  });

  it('puts newest unlocked items leftmost in the carousel', () => {
    const items = groupCabinetRailItems([
      entry(def({ id: 'habit_first_win', ruleKind: 'HABIT_FIRST_WIN', threshold: 1 }), true, {
        earnedAt: '2026-06-01T00:00:00.000Z',
      }),
      entry(def({ id: 'habit_games_100', ruleKind: 'HABIT_VOLUME', threshold: 100 }), true, {
        earnedAt: '2026-01-01T00:00:00.000Z',
      }),
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true, {
        earnedAt: '2026-02-01T00:00:00.000Z',
      }),
    ]);
    // first_win (Jun) before volume stack (latest earn Feb)
    expect(items[0]?.kind).toBe('card');
    if (items[0]?.kind === 'card') {
      expect(items[0].entry.definition.id).toBe('habit_first_win');
    }
    expect(items[1]?.kind).toBe('stack');
    if (items[1]?.kind === 'stack') {
      expect(items[1].entries.map((e) => e.definition.id)).toEqual([
        'habit_games_10',
        'habit_games_100',
      ]);
    }
  });

  it('does not stack across different ruleKinds', () => {
    const items = groupCabinetRailItems([
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
      entry(def({ id: 'habit_streak_4', ruleKind: 'HABIT_STREAK', threshold: 4 }), true),
    ]);
    expect(items.every((i) => i.kind === 'card')).toBe(true);
    expect(items).toHaveLength(2);
    // Higher threshold (games 10) before streak 4
    if (items[0]?.kind === 'card' && items[1]?.kind === 'card') {
      expect(items[0].entry.definition.id).toBe('habit_games_10');
      expect(items[1].entry.definition.id).toBe('habit_streak_4');
    }
  });

  it('puts unlocked items before locked', () => {
    const items = groupCabinetRailItems([
      entry(
        def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500 }),
        false,
        { progress: { current: 400, target: 500 } },
      ),
      entry(
        def({ id: 'habit_first_win', ruleKind: 'HABIT_FIRST_WIN' }),
        true,
        { earnedAt: '2026-01-15T00:00:00.000Z' },
      ),
    ]);
    expect(items[0]?.kind).toBe('card');
    if (items[0]?.kind === 'card') {
      expect(items[0].entry.unlocked).toBe(true);
    }
  });

  it('ignores malformed entries and invalid dates without throwing', () => {
    const items = groupCabinetRailItems([
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true, {
        earnedAt: 'not-a-date',
      }),
      entry(def({ id: 'habit_games_50', ruleKind: 'HABIT_VOLUME', threshold: 50 }), true, {
        earnedAt: '2026-03-01T00:00:00.000Z',
      }),
      {
        definition: {
          id: '',
          ruleKind: '',
          rarity: 'COMMON',
          artKey: '',
          titleKey: '',
          descriptionKey: '',
          type: 'MILESTONE',
        },
        unlocked: true,
        instances: [],
        progress: { current: Number.NaN, target: 0 },
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('stack');
  });

  it('returns empty for empty input', () => {
    expect(groupCabinetRailItems([])).toEqual([]);
  });
});
