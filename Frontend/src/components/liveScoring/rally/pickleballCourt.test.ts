import { describe, expect, it } from 'vitest';
import {
  PICKLEBALL_COURT_INSET,
  PICKLEBALL_HALF_COURT_FT,
  PICKLEBALL_HALF_COURT_UNITS,
  PICKLEBALL_NET_Y,
  PICKLEBALL_NVZ_DEPTH_FT,
  PICKLEBALL_VB_H,
  PB_CENTER_X,
  PB_NVZ_BOTTOM_Y,
  PB_NVZ_TOP_Y,
  pbBaselineYForEnd,
  pbDoublesMirroredBaselineX,
  PB_RIGHT_BOX_X,
  pbPlayerXForSlot,
  pbServeBallYForEnd,
  pbServeOverlayGeometry,
  pbServerEnd,
  pbSinglesBoxXForEnd,
  pbSinglesQuadrantSide,
  pickleballNvzLineY,
  pickleballNvzOffsetFromNet,
} from './pickleballCourtGeometry';

describe('pickleballCourtGeometry', () => {
  it('avatar scale grows toward near POV baseline', async () => {
    const { pbAvatarScaleFromFlatY, pbAvatarScaleFromScreenY, pbProjectFlat } = await import(
      './pickleballCourtLayout'
    );
    const farFlat = pbBaselineYForEnd('top');
    const nearFlat = pbBaselineYForEnd('bottom');
    expect(pbAvatarScaleFromFlatY(nearFlat)).toBeGreaterThan(pbAvatarScaleFromFlatY(farFlat));
    expect(pbAvatarScaleFromFlatY(farFlat)).toBeCloseTo(1, 5);
    const farScreen = pbProjectFlat(PB_CENTER_X, farFlat);
    const nearScreen = pbProjectFlat(PB_CENTER_X, nearFlat);
    expect(pbAvatarScaleFromScreenY(nearScreen.y)).toBeGreaterThan(pbAvatarScaleFromScreenY(farScreen.y));
  });

  it('places NVZ lines at 7ft of 22ft half-court from the net', () => {
    const offset = pickleballNvzOffsetFromNet();
    expect(offset).toBeCloseTo((PICKLEBALL_NVZ_DEPTH_FT / PICKLEBALL_HALF_COURT_FT) * PICKLEBALL_HALF_COURT_UNITS);
    expect(pickleballNvzLineY('top')).toBeCloseTo(PICKLEBALL_NET_Y - offset);
    expect(pickleballNvzLineY('bottom')).toBeCloseTo(PICKLEBALL_NET_Y + offset);
  });

  it('keeps top and bottom kitchen lines symmetric around the net', () => {
    const top = pickleballNvzLineY('top');
    const bottom = pickleballNvzLineY('bottom');
    expect(top + bottom).toBeCloseTo(PICKLEBALL_NET_Y * 2);
    expect(bottom - top).toBeCloseTo(pickleballNvzOffsetFromNet() * 2);
  });

  it('maps team B to top when ends are not swapped', () => {
    expect(pbServerEnd('teamB', false)).toBe('top');
    expect(pbServerEnd('teamA', false)).toBe('bottom');
    expect(pbServerEnd('teamA', true)).toBe('top');
    expect(pbServerEnd('teamB', true)).toBe('bottom');
  });

  it('uses diagonal singles service boxes', () => {
    expect(pbSinglesBoxXForEnd('top', true)).toBeLessThan(pbSinglesBoxXForEnd('bottom', true));
    expect(pbSinglesQuadrantSide('top', true)).toBe('left');
    expect(pbSinglesQuadrantSide('bottom', true)).toBe('right');
  });

  it('places players near the baseline in each service box', () => {
    const topY = pbBaselineYForEnd('top');
    const bottomY = pbBaselineYForEnd('bottom');
    expect(topY).toBeGreaterThan(PICKLEBALL_COURT_INSET);
    expect(topY).toBeLessThan(PB_NVZ_TOP_Y);
    expect(bottomY).toBeGreaterThan(PB_NVZ_BOTTOM_Y);
    expect(bottomY).toBeLessThan(PICKLEBALL_VB_H - PICKLEBALL_COURT_INSET);
  });

  it('places serve ball between player and net', () => {
    const topPlayer = pbBaselineYForEnd('top');
    const topBall = pbServeBallYForEnd('top');
    expect(topBall).toBeGreaterThan(topPlayer);

    const bottomPlayer = pbBaselineYForEnd('bottom');
    const bottomBall = pbServeBallYForEnd('bottom');
    expect(bottomBall).toBeLessThan(bottomPlayer);
  });

  it('places receiving team in diagonal service box during active doubles serve', () => {
    const serveRight = true;
    const serverEnd = pbServerEnd('teamA', false);
    const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
    const serverX = pbPlayerXForSlot(serverEnd, 0, true, serveRight, true, 0, serverEnd, {
      team: 'teamA',
      serverTeam: 'teamA',
      teamMirrored: false,
      endsSetup: false,
    });
    const receiverX = pbPlayerXForSlot(receiverEnd, 0, true, serveRight, true, 0, serverEnd, {
      team: 'teamB',
      serverTeam: 'teamA',
      teamMirrored: false,
      endsSetup: false,
    });
    expect(serverX).toBe(PB_RIGHT_BOX_X);
    expect(receiverX).toBe(pbSinglesBoxXForEnd(receiverEnd, serveRight));
    expect(serverX).not.toBe(receiverX);
  });

  it('swaps doubles baseline X when team sides are mirrored', () => {
    expect(pbDoublesMirroredBaselineX(0, false)).toBeGreaterThan(pbDoublesMirroredBaselineX(1, false));
    expect(pbDoublesMirroredBaselineX(0, true)).toBeLessThan(pbDoublesMirroredBaselineX(1, true));
    const setupX = pbPlayerXForSlot('top', 0, true, true, true, 0, 'bottom', {
      team: 'teamA',
      serverTeam: 'teamA',
      teamMirrored: true,
      endsSetup: true,
    });
    const defaultX = pbPlayerXForSlot('top', 0, true, true, true, 0, 'bottom', {
      team: 'teamA',
      serverTeam: 'teamA',
      teamMirrored: false,
      endsSetup: true,
    });
    expect(setupX).not.toBe(defaultX);
  });

  it('builds serve overlay percentages inside the view box', () => {
    const geom = pbServeOverlayGeometry({
      serverTeam: 'teamA',
      courtEndsSwapped: false,
      serveRight: true,
      matchDoubles: false,
      serverPlayerIndex: 0,
    });
    expect(geom.ballLeftPct).toBeGreaterThan(0);
    expect(geom.ballLeftPct).toBeLessThan(100);
    expect(geom.ballTopPct).toBeGreaterThan(50);
    expect(geom.arrowD.startsWith('M ')).toBe(true);
    expect(geom.arrowD).toContain(String(PICKLEBALL_NET_Y));
  });
});

describe('pickleballCourtLayout', () => {
  it('perspective: near baseline wider than far baseline', async () => {
    const { pbProjectFlat } = await import('./pickleballCourtLayout');
    const { x: sx, y: sy, w: sw, h: sh } = (await import('./pickleballCourtGeometry')).PICKLEBALL_SURFACE;
    const topL = pbProjectFlat(sx, sy);
    const topR = pbProjectFlat(sx + sw, sy);
    const bottomL = pbProjectFlat(sx, sy + sh);
    const bottomR = pbProjectFlat(sx + sw, sy + sh);
    expect(bottomR.x - bottomL.x).toBeGreaterThan(topR.x - topL.x);
    expect(bottomL.y).toBeGreaterThan(topL.y);
  });

  it('projects serve overlay into scene view box with lifted arc', async () => {
    const { pbSceneServeOverlay, pbQuadPoint } = await import('./pickleballCourtLayout');
    const { serveArcTraceFromEndpoints } = await import('./serveArcGeometry');
    const from = { x: 40, y: 160 };
    const to = { x: 72, y: 48 };
    const flatControl = { x: 56, y: 100 };
    const geom = pbSceneServeOverlay(
      {
        serverTeam: 'teamA',
        courtEndsSwapped: false,
        serveRight: true,
        matchDoubles: false,
        serverPlayerIndex: 0,
      },
      { from, to }
    );
    expect(geom.ballLeftPct).toBeGreaterThan(0);
    expect(geom.ballLeftPct).toBeLessThan(100);
    expect(geom.arrowD.startsWith('M ')).toBe(true);
    expect(geom.arrowD).toContain(' Q ');

    const arc = serveArcTraceFromEndpoints(from, to, flatControl);
    const mid = pbQuadPoint(arc.start, arc.control, arc.end, 0.5);
    const chordY = (arc.start.y + arc.end.y) / 2;
    expect(mid.y).toBeLessThan(chordY);
  });

  it('keeps projected scene content inside the view box with margin on all sides', async () => {
    const {
      pbProjectFlat,
      pbSceneGeometry,
      PB_SCENE_MIN_X,
      PB_SCENE_MIN_Y,
      PB_SCENE_VB_H,
      PB_SCENE_VB_W,
    } = await import('./pickleballCourtLayout');
    const { pbBaselineYForEnd } = await import('./pickleballCourtGeometry');
    const scene = pbSceneGeometry();
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pts of [scene.surround, scene.floor, scene.leftCurb, scene.rightCurb]) {
      for (const p of pts.split(' ')) {
        const [x, y] = p.split(',').map(Number);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    maxY = Math.max(maxY, pbProjectFlat(50, pbBaselineYForEnd('bottom')).y + 18);
    expect(minX).toBeGreaterThanOrEqual(PB_SCENE_MIN_X);
    expect(maxX).toBeLessThanOrEqual(PB_SCENE_MIN_X + PB_SCENE_VB_W);
    expect(maxY).toBeLessThan(PB_SCENE_MIN_Y + PB_SCENE_VB_H);
    expect(PB_SCENE_VB_H).toBeLessThan(220);
    expect(PB_SCENE_VB_W).toBeLessThan(150);
  });

  it('net spans sidelines on one horizontal floor line', async () => {
    const { pbNetLayout } = await import('./pickleballCourtLayout');
    const net = pbNetLayout();
    expect(net.left.y).toBeCloseTo(net.right.y);
    expect(net.right.x).toBeGreaterThan(net.left.x);
    expect(net.span).toBeCloseTo(net.right.x - net.left.x);
  });
});
