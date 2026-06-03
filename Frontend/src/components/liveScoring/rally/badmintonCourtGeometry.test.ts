import { describe, expect, it } from 'vitest';
import {
  BD_ALLEY,
  BD_BACK_SERVICE,
  BD_COURT_W_D,
  BD_COURT_W_S,
  BD_DOUBLES_LONG,
  BD_HALF_L,
  BD_LEFT_BOX_CX,
  BD_NET_Y,
  BD_RATIO,
  BD_RIGHT_BOX_CX,
  BD_SCALE,
  BD_SERVICE_HALF_W,
  BD_SHORT_SERVICE,
  BD_SHORT_SERVICE_BOTTOM,
  BD_SHORT_SERVICE_TOP,
  BD_VIEW_PAD,
  bdBackServiceBoxRect,
  bdPlayerYForEnd,
  bdReceiveTargetYForEnd,
  bdServeOverlayGeometry,
  bdShuttleYInFrontOfPlayer,
  bdServerEnd,
  bdServiceBoxRect,
  bdSinglesBoxXForEnd,
  bdSinglesQuadrantSide,
} from './badmintonCourtGeometry';

describe('badmintonCourtGeometry', () => {
  it('uses official BWF dimensions', () => {
    expect(BD_COURT_W_D).toBe(6.1);
    expect(BD_COURT_W_S).toBe(5.18);
    expect(BD_ALLEY).toBeCloseTo(0.46, 2);
    expect(BD_SHORT_SERVICE).toBe(1.98);
    expect(BD_DOUBLES_LONG).toBe(0.76);
    expect(BD_SERVICE_HALF_W).toBeCloseTo(2.59, 2);
    expect(BD_BACK_SERVICE).toBeCloseTo(3.96, 2);
    expect(BD_HALF_L - BD_SHORT_SERVICE - BD_DOUBLES_LONG).toBeCloseTo(BD_BACK_SERVICE, 2);
  });

  it('places teamA on bottom when ends not swapped', () => {
    expect(bdServerEnd('teamA', false)).toBe('bottom');
    expect(bdServerEnd('teamB', false)).toBe('top');
  });

  it('swaps ends when courtEndsSwapped', () => {
    expect(bdServerEnd('teamA', true)).toBe('top');
    expect(bdServerEnd('teamB', true)).toBe('bottom');
  });

  it('maps even score to right service court on bottom end', () => {
    expect(bdSinglesQuadrantSide('bottom', true)).toBe('right');
    expect(bdSinglesBoxXForEnd('bottom', true)).toBe(BD_RIGHT_BOX_CX);
    expect(bdSinglesBoxXForEnd('bottom', false)).toBe(BD_LEFT_BOX_CX);
  });

  it('maps even score to right service court on top end (server faces net)', () => {
    expect(bdSinglesQuadrantSide('top', true)).toBe('left');
    expect(bdSinglesBoxXForEnd('top', true)).toBe(BD_LEFT_BOX_CX);
    expect(bdSinglesBoxXForEnd('top', false)).toBe(BD_RIGHT_BOX_CX);
  });

  it('diagonal serve: even score bottom server → top receiver opposite half', () => {
    const g = bdServeOverlayGeometry({
      serverTeam: 'teamA',
      courtEndsSwapped: false,
      serveRight: true,
      matchDoubles: false,
      serverPlayerIndex: 0,
    });
    expect(g.arrowD).toContain(String(BD_RIGHT_BOX_CX + BD_VIEW_PAD));
    expect(g.arrowD).toContain(String(BD_LEFT_BOX_CX + BD_VIEW_PAD));
  });

  it('highlights back service court for server, front court for receiver target', () => {
    const side = bdSinglesQuadrantSide('bottom', true);
    const serverBox = bdBackServiceBoxRect('bottom', side);
    const recvBox = bdServiceBoxRect('top', side);
    expect(serverBox.y).toBeGreaterThanOrEqual(BD_SHORT_SERVICE_BOTTOM);
    expect(recvBox.y).toBeLessThan(BD_NET_Y);
    expect(recvBox.y + recvBox.h).toBeGreaterThan(BD_SHORT_SERVICE_TOP);
  });

  it('places shuttle in front of server toward the short service line', () => {
    const playerY = bdPlayerYForEnd('bottom');
    const shuttleY = bdShuttleYInFrontOfPlayer('bottom', playerY);
    expect(shuttleY).toBeLessThan(playerY);
    expect(shuttleY).toBeGreaterThan(BD_SHORT_SERVICE_BOTTOM);
  });

  it('uses chord-apex lob control well above the net-lift default', async () => {
    const { serveArcControlApex, serveArcControlLifted, serveArcQuadPoint } = await import('./serveArcGeometry');
    const { bdSceneServeArcControl } = await import('./badmintonCourtLayout');
    const { BD_SERVE_ARC_MIN_RISE, BD_SERVE_ARC_RISE_FACTOR } = await import('./badmintonCourtGeometry');
    const from = { x: 48, y: 168 };
    const to = { x: 72, y: 42 };
    const flat = { x: 60, y: 105 };
    const netLift = serveArcControlLifted(from, to, flat);
    const lob = bdSceneServeArcControl(from, to);
    expect(lob.y).toBeLessThan(netLift.y - 20);
    const chordY = (from.y + to.y) / 2;
    const apex = serveArcQuadPoint(from, lob, to, 0.5);
    expect(apex.y).toBeLessThan(chordY - BD_SERVE_ARC_MIN_RISE * 0.35);
    expect(serveArcControlApex(from, to, { minRise: BD_SERVE_ARC_MIN_RISE, riseFactor: BD_SERVE_ARC_RISE_FACTOR }).y).toBe(
      lob.y
    );
  });

  it('trajectory arcs over the net to the receiver service court', () => {
    const g = bdServeOverlayGeometry({
      serverTeam: 'teamA',
      courtEndsSwapped: false,
      serveRight: true,
      matchDoubles: false,
      serverPlayerIndex: 0,
    });
    const startY =
      bdShuttleYInFrontOfPlayer('bottom', bdPlayerYForEnd('bottom')) + BD_VIEW_PAD;
    const endY = bdReceiveTargetYForEnd('top') + BD_VIEW_PAD;
    expect(g.arrowD).toContain(String(startY));
    expect(g.arrowD).toContain(String(endY));
    expect(g.arrowD).toContain(String(BD_LEFT_BOX_CX + BD_VIEW_PAD));
    expect(g.arrowD).toContain(String(BD_NET_Y + BD_VIEW_PAD));
  });

  it('centre line bounds exclude front service zone', () => {
    const box = bdServiceBoxRect('top', 'left');
    expect(box.y).toBeGreaterThanOrEqual(BD_SHORT_SERVICE_TOP);
    expect(box.y + box.h).toBeLessThanOrEqual(BD_NET_Y);
  });

  it('uses BWF front service box dimensions (1.98 m deep, 2.59 m wide)', () => {
    const box = bdServiceBoxRect('top', 'left');
    expect(box.h).toBeCloseTo(BD_SHORT_SERVICE * BD_SCALE, 0);
    expect(box.w).toBeCloseTo(BD_SERVICE_HALF_W * BD_SCALE, 0);
    expect(box.y).toBe(BD_SHORT_SERVICE_TOP);
    expect(BD_NET_Y - box.y).toBeCloseTo(box.h, 0);
  });

  it('matches official court ratios', () => {
    expect(BD_RATIO.shortServiceFromNet).toBeCloseTo(1.98 / 6.7, 3);
    expect(BD_RATIO.backServiceDepth).toBeCloseTo(3.96 / 6.7, 3);
    expect(BD_RATIO.doublesLongFromBaseline).toBeCloseTo(0.76 / 6.7, 3);
    expect(BD_RATIO.singlesAlley).toBeCloseTo(0.46 / 6.1, 3);
  });

  it('places avatars in back court, not at the net', () => {
    const topY = bdPlayerYForEnd('top');
    const bottomY = bdPlayerYForEnd('bottom');
    expect(topY).toBeLessThan(BD_SHORT_SERVICE_TOP - 10);
    expect(bottomY).toBeGreaterThan(BD_SHORT_SERVICE_BOTTOM + 10);
  });

  it('builds diagonal serve arrow from server to receiver box', () => {
    const g = bdServeOverlayGeometry({
      serverTeam: 'teamA',
      courtEndsSwapped: false,
      serveRight: true,
      matchDoubles: false,
      serverPlayerIndex: 0,
    });
    expect(g.arrowD).toMatch(/^M \d+/);
    expect(g.ballLeftPct).toBeGreaterThan(0);
    expect(g.ballTopPct).toBeGreaterThan(50);
  });

  it('supports doubles overlay geometry', () => {
    const g = bdServeOverlayGeometry({
      serverTeam: 'teamB',
      courtEndsSwapped: false,
      serveRight: false,
      matchDoubles: true,
      serverPlayerIndex: 1,
    });
    expect(g.arrowD).toContain('Q');
  });
});
