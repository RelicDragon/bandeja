import { describe, expect, it } from 'vitest';
import {
  pileBoxSizeRem,
  pileLayerStyle,
  selectPileLayers,
  stackExpandedWidthRem,
  stackFamilyLabelKey,
} from '@/components/trophies/trophyStackGeometry';

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

  it('maps ruleKind to family label keys', () => {
    expect(stackFamilyLabelKey('HABIT_VOLUME')).toBe('trophies.cabinet.family.games');
    expect(stackFamilyLabelKey('HABIT_WINS')).toBe('trophies.cabinet.family.wins');
    expect(stackFamilyLabelKey('HABIT_FIRST_WIN')).toBe('trophies.cabinet.family.wins');
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
