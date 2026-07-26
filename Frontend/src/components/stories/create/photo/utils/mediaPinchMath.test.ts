import { describe, expect, it } from 'vitest';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';
import { clientToCanvasPoint, scaleMediaAroundCanvasPoint } from './mediaPinchMath';

describe('mediaPinchMath', () => {
  it('maps client coords into canvas space', () => {
    const p = clientToCanvasPoint(100, 200, { left: 10, top: 20 }, 0.5);
    expect(p.x).toBeCloseTo(180);
    expect(p.y).toBeCloseTo(360);
  });

  it('keeps focal canvas point stable when scaling (no rotation)', () => {
    const transform = { x: 0, y: 0, scale: 1, rotation: 0 };
    const focal = { x: STORY_CANVAS_WIDTH / 2 + 100, y: STORY_CANVAS_HEIGHT / 2 - 50 };
    const next = scaleMediaAroundCanvasPoint(transform, focal, 2);

    // Inverse-map focal through next transform → same local as through prev.
    const cx0 = STORY_CANVAS_WIDTH / 2 + transform.x;
    const cy0 = STORY_CANVAS_HEIGHT / 2 + transform.y;
    const localX = (focal.x - cx0) / transform.scale;
    const localY = (focal.y - cy0) / transform.scale;

    const cx1 = STORY_CANVAS_WIDTH / 2 + next.x;
    const cy1 = STORY_CANVAS_HEIGHT / 2 + next.y;
    const worldX = cx1 + localX * next.scale;
    const worldY = cy1 + localY * next.scale;
    expect(worldX).toBeCloseTo(focal.x, 5);
    expect(worldY).toBeCloseTo(focal.y, 5);
  });

  it('keeps focal point stable with rotation', () => {
    const transform = { x: 40, y: -20, scale: 0.8, rotation: 25 };
    const focal = { x: 600, y: 900 };
    const next = scaleMediaAroundCanvasPoint(transform, focal, 1.6);

    const rad = (-transform.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx0 = STORY_CANVAS_WIDTH / 2 + transform.x;
    const cy0 = STORY_CANVAS_HEIGHT / 2 + transform.y;
    const dx = focal.x - cx0;
    const dy = focal.y - cy0;
    const localX = (dx * cos - dy * sin) / transform.scale;
    const localY = (dx * sin + dy * cos) / transform.scale;

    const fwd = (next.rotation * Math.PI) / 180;
    const fcos = Math.cos(fwd);
    const fsin = Math.sin(fwd);
    const cx1 = STORY_CANVAS_WIDTH / 2 + next.x;
    const cy1 = STORY_CANVAS_HEIGHT / 2 + next.y;
    const worldX = cx1 + localX * next.scale * fcos - localY * next.scale * fsin;
    const worldY = cy1 + localX * next.scale * fsin + localY * next.scale * fcos;
    expect(worldX).toBeCloseTo(focal.x, 4);
    expect(worldY).toBeCloseTo(focal.y, 4);
  });
});
