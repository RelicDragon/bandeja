import { describe, expect, it } from 'vitest';
import {
  BD_ALLEY,
  BD_BACK_SERVICE,
  BD_COURT_H,
  BD_COURT_L,
  BD_COURT_W,
  BD_COURT_W_D,
  BD_COURT_W_S,
  BD_DOUBLES_LONG,
  BD_DOUBLES_LONG_BOTTOM,
  BD_DOUBLES_LONG_TOP,
  BD_HALF_L,
  BD_NET_Y,
  BD_RATIO,
  BD_SCALE,
  BD_SHORT_SERVICE,
  BD_SHORT_SERVICE_BOTTOM,
  BD_SHORT_SERVICE_TOP,
  BD_SINGLES_LEFT,
  BD_SINGLES_RIGHT,
  BD_SURFACE,
  bdBackServiceBoxRect,
  bdServiceBoxRect,
} from './badmintonCourtGeometry';
import {
  BD_COURT_L_M,
  BD_COURT_W_M,
  BD_NET_BOTTOM_CLEARANCE_M,
  BD_NET_MESH_HEIGHT_M,
  BD_NET_POST_HEIGHT_M,
  BD_SCENE_VB_H,
  BD_SCENE_VB_W,
  bdNetLayout,
  bdProjectFlat,
  bdScreenPxPerMeterAtNet,
} from './badmintonCourtLayout';

const m = (svgUnits: number) => svgUnits / BD_SCALE;

describe('badmintonCourtLayout proportions', () => {
  it('flat court SVG units match BWF length × width', () => {
    expect(m(BD_COURT_W)).toBeCloseTo(BD_COURT_W_D, 4);
    expect(m(BD_COURT_H)).toBeCloseTo(BD_COURT_L, 4);
    expect(BD_COURT_W / BD_COURT_H).toBeCloseTo(BD_COURT_W_D / BD_COURT_L, 4);
  });

  it('half-court zones sum to 6.70 m (doubles long + back service + front service)', () => {
    const topHalf =
      m(BD_DOUBLES_LONG_TOP - BD_SURFACE.y) +
      m(BD_SHORT_SERVICE_TOP - BD_DOUBLES_LONG_TOP) +
      m(BD_NET_Y - BD_SHORT_SERVICE_TOP);
    const bottomHalf =
      m(BD_SHORT_SERVICE_BOTTOM - BD_NET_Y) +
      m(BD_DOUBLES_LONG_BOTTOM - BD_SHORT_SERVICE_BOTTOM) +
      m(BD_SURFACE.y + BD_SURFACE.h - BD_DOUBLES_LONG_BOTTOM);
    expect(topHalf).toBeCloseTo(BD_HALF_L, 3);
    expect(bottomHalf).toBeCloseTo(BD_HALF_L, 3);
  });

  it('short service lines are 1.98 m from net', () => {
    expect(m(BD_NET_Y - BD_SHORT_SERVICE_TOP)).toBeCloseTo(BD_SHORT_SERVICE, 3);
    expect(m(BD_SHORT_SERVICE_BOTTOM - BD_NET_Y)).toBeCloseTo(BD_SHORT_SERVICE, 3);
  });

  it('doubles long lines are 0.76 m inside baselines', () => {
    expect(m(BD_DOUBLES_LONG_TOP - BD_SURFACE.y)).toBeCloseTo(BD_DOUBLES_LONG, 3);
    expect(m(BD_SURFACE.y + BD_SURFACE.h - BD_DOUBLES_LONG_BOTTOM)).toBeCloseTo(BD_DOUBLES_LONG, 3);
  });

  it('singles sidelines inset 0.46 m from doubles sidelines', () => {
    expect(m(BD_SINGLES_LEFT - BD_SURFACE.x)).toBeCloseTo(BD_ALLEY, 3);
    expect(m(BD_SURFACE.x + BD_SURFACE.w - BD_SINGLES_RIGHT)).toBeCloseTo(BD_ALLEY, 3);
    expect(m(BD_SINGLES_RIGHT - BD_SINGLES_LEFT)).toBeCloseTo(BD_COURT_W_S, 3);
  });

  it('service boxes use BWF depths and singles half-width', () => {
    const front = bdServiceBoxRect('top', 'left');
    const back = bdBackServiceBoxRect('top', 'left');
    expect(m(front.h)).toBeCloseTo(BD_SHORT_SERVICE, 3);
    expect(m(back.h)).toBeCloseTo(BD_BACK_SERVICE, 3);
    expect(m(front.w)).toBeCloseTo(BD_COURT_W_S / 2, 3);
    expect(m(back.w)).toBeCloseTo(BD_COURT_W_S / 2, 3);
  });

  it('scene viewBox stays portrait and close to flat court aspect for viewport fit', () => {
    const flatAspect = BD_COURT_W / BD_COURT_H;
    const sceneAspect = BD_SCENE_VB_W / BD_SCENE_VB_H;
    expect(sceneAspect).toBeLessThan(1);
    expect(sceneAspect).toBeGreaterThan(0.4);
    expect(sceneAspect).toBeCloseTo(flatAspect, 1);
  });

  it('avatar depth scale: 1 at far baseline, larger at near', async () => {
    const { bdAvatarScaleFromFlatY } = await import('./badmintonCourtLayout');
    const { BD_SURFACE } = await import('./badmintonCourtGeometry');
    const { y: sy, h: sh } = BD_SURFACE;
    expect(bdAvatarScaleFromFlatY(sy)).toBeCloseTo(1, 5);
    expect(bdAvatarScaleFromFlatY(sy + sh)).toBeCloseTo(40 / 30, 5);
    expect(bdAvatarScaleFromFlatY(sy + sh / 2)).toBeGreaterThan(1);
    expect(bdAvatarScaleFromFlatY(sy + sh / 2)).toBeLessThan(40 / 30);
  });

  it('perspective: near baseline wider than far baseline on screen', () => {
    const far = bdProjectFlat(BD_SURFACE.x, BD_SURFACE.y);
    const farR = bdProjectFlat(BD_SURFACE.x + BD_SURFACE.w, BD_SURFACE.y);
    const near = bdProjectFlat(BD_SURFACE.x, BD_SURFACE.y + BD_SURFACE.h);
    const nearR = bdProjectFlat(BD_SURFACE.x + BD_SURFACE.w, BD_SURFACE.y + BD_SURFACE.h);
    expect(nearR.x - near.x).toBeGreaterThan(farR.x - far.x);
  });

  it('perservation along depth: equal metre spans map to equal screen spans at same depth', () => {
    const y = BD_NET_Y;
    const a = bdProjectFlat(BD_SINGLES_LEFT, y);
    const b = bdProjectFlat(BD_SINGLES_LEFT + BD_SCALE, y);
    const c = bdProjectFlat(BD_SINGLES_LEFT + BD_SCALE * 2, y);
    const ab = b.x - a.x;
    const bc = c.x - b.x;
    expect(ab).toBeCloseTo(bc, 1);
  });

  it('net mesh/post heights match BWF metres at net scale', () => {
    const net = bdNetLayout();
    const pxPerM = bdScreenPxPerMeterAtNet();
    expect(net.meshBottomOffset / pxPerM).toBeCloseTo(BD_NET_BOTTOM_CLEARANCE_M, 2);
    expect(net.meshH / pxPerM).toBeCloseTo(BD_NET_MESH_HEIGHT_M, 2);
    expect(net.postH / pxPerM).toBeCloseTo(BD_NET_POST_HEIGHT_M, 2);
    expect(BD_NET_MESH_HEIGHT_M).toBeCloseTo(0.79, 2);
  });

  it('layout metres match geometry exports for watch ratios', () => {
    expect(BD_COURT_W_M).toBe(BD_COURT_W_D);
    expect(BD_COURT_L_M).toBe(BD_COURT_L);
    expect(BD_RATIO.shortServiceFromNet).toBeCloseTo(BD_SHORT_SERVICE / BD_HALF_L, 4);
    expect(BD_RATIO.doublesLongFromBaseline).toBeCloseTo(BD_DOUBLES_LONG / BD_HALF_L, 4);
    expect(BD_RATIO.singlesAlley).toBeCloseTo(BD_ALLEY / BD_COURT_W_D, 4);
  });
});
