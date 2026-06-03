import { describe, expect, it } from 'vitest';
import { BD_SCENE_VB_H, BD_SCENE_VB_W } from './rally/badmintonCourtLayout';
import { serveGuideFrameForUiId, serveGuideFrameSpec } from './serveGuideCourtFrame';

describe('serveGuideCourtFrame', () => {
  it('uses scene aspect ratio (not 1:2 padel) for badminton coach strip', () => {
    const frame = serveGuideFrameForUiId('badminton-board', 'coach');
    const ratio = BD_SCENE_VB_W / BD_SCENE_VB_H;
    expect(frame.style.aspectRatio).toBe(`${BD_SCENE_VB_W} / ${BD_SCENE_VB_H}`);
    expect(frame.className).not.toContain('aspect-[1/2]');
    expect(frame.className).toMatch(/w-\[min\(100%/);
    const widthRem = 7.5;
    expect(frame.style.aspectRatio).toBe(`${BD_SCENE_VB_W} / ${BD_SCENE_VB_H}`);
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
    expect(frame.className).toContain(`${widthRem}rem`);
  });

  it('width-first frame has no fixed height', () => {
    const frame = serveGuideFrameSpec(100, 200, 6.75);
    expect(frame.style.height).toBeUndefined();
    expect(frame.style.aspectRatio).toBe('100 / 200');
  });
});
