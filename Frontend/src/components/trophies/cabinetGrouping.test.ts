import { describe, expect, it } from 'vitest';
import {
  groupCabinetRailItems,
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
    multiplicity: 'one_shot',
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
  it('orders volume habits cheapest → legendary (top)', () => {
    const sorted = sortStackEntries([
      entry(def({ id: 'habit_games_1000', ruleKind: 'HABIT_VOLUME', threshold: 1000, rarity: 'LEGENDARY' }), true),
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
      entry(def({ id: 'habit_games_500', ruleKind: 'HABIT_VOLUME', threshold: 500, rarity: 'RARE' }), true),
    ]);
    expect(sorted.map((e) => e.definition.id)).toEqual([
      'habit_games_10',
      'habit_games_500',
      'habit_games_1000',
    ]);
  });

  it('orders podium bronze → gold (gold on top)', () => {
    const sorted = sortStackEntries([
      entry(def({ id: 'podium_gold', ruleKind: 'PODIUM', place: 1, rarity: 'LEGENDARY' }), true),
      entry(def({ id: 'podium_bronze', ruleKind: 'PODIUM', place: 3, rarity: 'RARE' }), true),
      entry(def({ id: 'podium_silver', ruleKind: 'PODIUM', place: 2, rarity: 'RARE' }), true),
    ]);
    expect(sorted.map((e) => e.definition.id)).toEqual([
      'podium_bronze',
      'podium_silver',
      'podium_gold',
    ]);
  });
});

describe('groupCabinetRailItems', () => {
  it('keeps a single entry as a card', () => {
    const items = groupCabinetRailItems([
      entry(def({ id: 'habit_first_win', ruleKind: 'HABIT_FIRST_WIN' }), true),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('card');
  });

  it('stacks unlocked habit_games separately from locked', () => {
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

  it('does not stack across different ruleKinds', () => {
    const items = groupCabinetRailItems([
      entry(def({ id: 'habit_games_10', ruleKind: 'HABIT_VOLUME', threshold: 10 }), true),
      entry(def({ id: 'habit_streak_4', ruleKind: 'HABIT_STREAK', threshold: 4 }), true),
    ]);
    expect(items.every((i) => i.kind === 'card')).toBe(true);
    expect(items).toHaveLength(2);
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
          multiplicity: 'one_shot',
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
