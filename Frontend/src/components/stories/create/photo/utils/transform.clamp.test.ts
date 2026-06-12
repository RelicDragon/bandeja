import { describe, expect, it } from 'vitest';
import { STORY_CANVAS_HEIGHT } from '../types';
import { clampLayerPosition, commitLayerDrag } from './transform';

describe('commitLayerDrag', () => {
  const base = { x: 540, y: 960, scale: 1, rotation: 15 };

  it('clamps drag coordinates inside canvas padding', () => {
    const next = commitLayerDrag(base, -20, STORY_CANVAS_HEIGHT + 500);
    expect(next.x).toBe(48);
    expect(next.y).toBe(STORY_CANVAS_HEIGHT - 48);
    expect(next.scale).toBe(base.scale);
    expect(next.rotation).toBe(base.rotation);
  });

  it('snaps Konva target when drag exceeds bounds', () => {
    const positions: { x: number; y: number }[] = [];
    const target = { position: (p: { x: number; y: number }) => positions.push(p) };
    commitLayerDrag(base, 0, 0, target);
    expect(positions).toEqual([{ x: 48, y: 48 }]);
  });

  it('does not snap Konva target when drag is in bounds', () => {
    const positions: { x: number; y: number }[] = [];
    const target = { position: (p: { x: number; y: number }) => positions.push(p) };
    commitLayerDrag(base, 400, 600, target);
    expect(positions).toHaveLength(0);
    expect(clampLayerPosition(400, 600)).toEqual({ x: 400, y: 600 });
  });
});
