import { describe, expect, it } from 'vitest';
import { sortFamilyStackEntries } from '@/components/trophies/cabinetGrouping';
import {
  pileBoxSizeRem,
  pileLayerStyle,
  selectFamilyPileLayers,
  selectPileLayers,
  stackExpandedWidthRem,
  stackFamilyLabelKey,
} from '@/components/trophies/trophyStackGeometry';
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
): TrophyCabinetEntryView {
  return {
    definition,
    unlocked,
    instances: unlocked
      ? [
          {
            id: `i-${definition.id}`,
            definitionId: definition.id,
            earnedAt: '2026-01-01T00:00:00.000Z',
            sport: null,
            place: null,
            source: null,
          },
        ]
      : [],
    progress: unlocked ? null : { current: 1, target: definition.threshold ?? 1 },
  };
}

describe('trophyStackGeometry', () => {
  it('puts rarest layer on top z-order and above backs', () => {
    const layers = [0, 1, 2].map((i) => pileLayerStyle(i, 3));
    expect(layers[2]!.zIndex).toBeGreaterThan(layers[0]!.zIndex);
    expect(layers[0]!.yRem).toBeGreaterThan(layers[2]!.yRem);
  });

  it('clamps invalid pile indices', () => {
    const layer = pileLayerStyle(-2, 3);
    expect(layer.zIndex).toBe(0);
    expect(Number.isFinite(layer.xRem)).toBe(true);
  });

  it('caps painted pile layers but keeps cheapest + rarest (paint worst→best)', () => {
    // Input best → worst
    const ids = ['f', 'e', 'd', 'c', 'b', 'a'];
    expect(selectPileLayers(ids)).toEqual(['a', 'd', 'e', 'f']);
  });

  it('keeps face, next chase, and max on mixed family piles over the layer cap', () => {
    const family = sortFamilyStackEntries([
      entry(def({ id: 'habit_wins_25', ruleKind: 'HABIT_WINS', threshold: 25 }), true),
      entry(def({ id: 'habit_wins_10', ruleKind: 'HABIT_WINS', threshold: 10 }), true),
      entry(def({ id: 'habit_first_win', ruleKind: 'HABIT_FIRST_WIN', threshold: 1 }), true),
      entry(def({ id: 'habit_wins_50', ruleKind: 'HABIT_WINS', threshold: 50 }), false),
      entry(def({ id: 'habit_wins_100', ruleKind: 'HABIT_WINS', threshold: 100 }), false),
      entry(
        def({
          id: 'habit_wins_500',
          ruleKind: 'HABIT_WINS',
          threshold: 500,
          rarity: 'LEGENDARY',
        }),
        false,
      ),
    ]);
    expect(family.map((e) => e.definition.id)).toEqual([
      'habit_wins_25',
      'habit_wins_10',
      'habit_first_win',
      'habit_wins_50',
      'habit_wins_100',
      'habit_wins_500',
    ]);

    const pile = selectFamilyPileLayers(family);
    const ids = pile.map((e) => e.definition.id);
    expect(ids).toHaveLength(4);
    expect(ids[ids.length - 1]).toBe('habit_wins_25');
    expect(ids).toContain('habit_wins_50');
    expect(ids).toContain('habit_wins_500');
  });

  it('maps ruleKind to family label keys', () => {
    expect(stackFamilyLabelKey('HABIT_VOLUME')).toBe('trophies.cabinet.family.games');
    expect(stackFamilyLabelKey('HABIT_WINS')).toBe('trophies.cabinet.family.wins');
    expect(stackFamilyLabelKey('HABIT_FIRST_WIN')).toBe('trophies.cabinet.family.wins');
    expect(stackFamilyLabelKey('HABIT_SPORT_VOLUME')).toBe('trophies.cabinet.family.games');
    expect(stackFamilyLabelKey('PODIUM')).toBe('trophies.cabinet.family.podium');
    expect(stackFamilyLabelKey('UNKNOWN')).toBe('trophies.cabinet.family.generic');
  });

  it('computes expanded rail width and rem box size', () => {
    // Frame padding + 3 icons + inter-icon/trailing gaps + collapse chip.
    expect(stackExpandedWidthRem(3)).toBeCloseTo(0.5 * 2 + 4.75 * 3 + 0.5 * 3 + 1.75);
    expect(stackExpandedWidthRem(0)).toBe(0);
    const box = pileBoxSizeRem(3);
    expect(box.widthRem).toBe(4.5);
    expect(box.heightRem).toBe(4.5);
  });
});
