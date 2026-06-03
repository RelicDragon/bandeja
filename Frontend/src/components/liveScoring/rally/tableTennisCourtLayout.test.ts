import { describe, expect, it } from 'vitest';
import { TT_SURFACE, TT_TABLE_L_M, TT_TABLE_W_M } from './tableTennisCourtGeometry';
import {
  TT_SCENE_VB_H,
  TT_SCENE_VB_W,
  ttProjectFlat,
  ttSceneGeometry,
  ttServeGuideFrameAspect,
} from './tableTennisCourtLayout';

describe('tableTennisCourtLayout', () => {
  it('scene viewBox aspect and table screen width', () => {
    const flatAspect = TT_SURFACE.w / TT_SURFACE.h;
    const sceneAspect = TT_SCENE_VB_W / TT_SCENE_VB_H;
    const s = TT_SURFACE;
    const farL = ttProjectFlat(s.x, s.y);
    const farR = ttProjectFlat(s.x + s.w, s.y);
    const nearL = ttProjectFlat(s.x, s.y + s.h);
    const nearR = ttProjectFlat(s.x + s.w, s.y + s.h);
    const nearW = nearR.x - nearL.x;
    const farW = farR.x - farL.x;
    const physRatio = TT_TABLE_W_M / TT_TABLE_L_M;
    const [guideW, guideH] = ttServeGuideFrameAspect();
    expect(guideW / guideH).toBeGreaterThan(sceneAspect);
    expect(sceneAspect).toBeGreaterThan(0.45);
    expect(sceneAspect).toBeGreaterThan(flatAspect - 0.05);
    expect(nearW).toBeGreaterThan(88);
    expect(nearW).toBeGreaterThan(farW);
    expect(nearW / (ttProjectFlat(s.x, s.y + s.h).y - ttProjectFlat(s.x, s.y).y)).toBeGreaterThan(physRatio * 0.85);
  });

  it('scene geometry fits view box', () => {
    const scene = ttSceneGeometry();
    let maxX = -Infinity;
    for (const pts of [scene.floor, scene.frame]) {
      for (const p of pts.split(' ')) {
        const x = Number(p.split(',')[0]);
        maxX = Math.max(maxX, x);
      }
    }
    expect(maxX).toBeLessThan(TT_SCENE_VB_W + 20);
  });
});
