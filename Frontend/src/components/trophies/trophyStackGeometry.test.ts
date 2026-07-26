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

  it('caps painted pile layers but keeps cheapest + rarest', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(selectPileLayers(ids)).toEqual(['a', 'd', 'e', 'f']);
  });

  it('maps ruleKind to family label keys', () => {
    expect(stackFamilyLabelKey('HABIT_VOLUME')).toBe('trophies.cabinet.family.games');
    expect(stackFamilyLabelKey('PODIUM')).toBe('trophies.cabinet.family.podium');
    expect(stackFamilyLabelKey('UNKNOWN')).toBe('trophies.cabinet.family.generic');
  });

  it('computes expanded rail width and rem box size', () => {
    // 3 cards + gaps + collapse chip
    expect(stackExpandedWidthRem(3)).toBeCloseTo(6.75 * 3 + 0.625 * 2 + 0.625 + 1.75);
    expect(stackExpandedWidthRem(0)).toBe(0);
    const box = pileBoxSizeRem(3);
    expect(box.widthRem).toBeGreaterThan(4.5);
    expect(box.heightRem).toBeGreaterThan(4.5);
  });
});
