import { describe, expect, it } from 'vitest';
import {
  SQ_BOX_M,
  SQ_COURT_L,
  SQ_COURT_W,
  SQ_HALF_X,
  SQ_LINE_M,
  SQ_SHORT_M,
  SQ_SERVICE_BOX_BACK_Y,
  SQ_SERVICE_BOX_FRONT_Y,
  sqBoxCenter,
  sqServiceBoxMetres,
  sqLayoutMetrics,
  sqProject,
  sqReceiverPoint,
  sqSceneServeOverlay,
  sqServePlacement,
  sqSceneServiceBox,
  sqServeSide,
  SQ_SERVE_BALL_MIN_SCREEN_GAP,
  sqSetupPlacement,
} from './squashCourtLayout';

describe('squashCourtLayout — WSF official diagram', () => {
  const m = sqLayoutMetrics();

  it('official floor dimensions (9750 × 8420 mm)', () => {
    expect(m.courtW).toBe(8.42);
    expect(m.courtL).toBe(9.75);
    expect(m.diagonal).toBeCloseTo(12.883, 2);
    expect(m.shortFromFront).toBe(5.44);
    expect(m.shortFromBack).toBeCloseTo(4.31, 2);
    expect(SQ_SHORT_M).toBe(5.44);
    expect(SQ_SERVICE_BOX_FRONT_Y).toBeCloseTo(5.44 + SQ_LINE_M, 5);
    expect(SQ_SERVICE_BOX_BACK_Y).toBeCloseTo(SQ_SERVICE_BOX_FRONT_Y + SQ_BOX_M, 5);
    expect(SQ_SERVICE_BOX_BACK_Y + SQ_LINE_M + 2.61).toBeCloseTo(SQ_COURT_L, 5);
  });

  it('service boxes are 1600 × 1600 mm behind the short line', () => {
    expect(m.boxSize).toBe(1.6);
    const left = sqServiceBoxMetres('left');
    const right = sqServiceBoxMetres('right');
    expect(left).toEqual({ x: 0, y: SQ_SERVICE_BOX_FRONT_Y, w: SQ_BOX_M, h: SQ_BOX_M });
    expect(right).toEqual({ x: SQ_COURT_W - SQ_BOX_M, y: SQ_SERVICE_BOX_FRONT_Y, w: SQ_BOX_M, h: SQ_BOX_M });
    expect(left.y).toBeGreaterThan(SQ_SHORT_M);
    expect(left.y + left.h).toBeLessThan(SQ_COURT_L);
    expect(SQ_HALF_X).toBeCloseTo(4.21, 2);
    expect(SQ_COURT_W - 2 * SQ_BOX_M).toBeCloseTo(5.22, 2);
  });

  it('receiver stands deep in opposite front quarter, clear of short line', () => {
    const shortY = sqProject(SQ_HALF_X, SQ_SHORT_M).y;
    const midFrontY = sqProject(SQ_HALF_X, SQ_SHORT_M * 0.5).y;
    for (const zone of ['shortLeft', 'shortRight'] as const) {
      const p = sqReceiverPoint(zone);
      expect(p.y).toBeLessThan(midFrontY);
      expect(p.y).toBeLessThan(shortY - 18);
    }
  });

  it('half-court line runs from short line to back wall at centre width', () => {
    expect(SQ_HALF_X).toBe(SQ_COURT_W / 2);
  });

  it('serve box by score parity — court-absolute left/right facing front wall', () => {
    expect(sqServeSide('left', true)).toBe('right');
    expect(sqServeSide('left', false)).toBe('left');
    expect(sqServeSide('right', true)).toBe('right');
    expect(sqServeSide('right', false)).toBe('left');
  });

  it('server in back box, receiver diagonal in opposite front quarter', () => {
    const cases = [
      { courtSide: 'rightDeuce' as const, serverZone: 'backRight', receiverZone: 'shortLeft' },
      { courtSide: 'leftAd' as const, serverZone: 'backLeft', receiverZone: 'shortRight' },
    ];
    for (const c of cases) {
      for (const serverTeam of ['teamA', 'teamB'] as const) {
        const pl = sqServePlacement({ serverTeam, courtEndsSwapped: false, courtSide: c.courtSide });
        expect(pl.serverZone).toBe(c.serverZone);
        expect(pl.receiverZone).toBe(c.receiverZone);
        expect(pl.server.y).toBeGreaterThan(pl.receiver.y);
      }
      const swapped = sqServePlacement({ serverTeam: 'teamA', courtEndsSwapped: true, courtSide: c.courtSide });
      const normal = sqServePlacement({ serverTeam: 'teamA', courtEndsSwapped: false, courtSide: c.courtSide });
      expect(swapped.serverZone).toBe(normal.serverZone);
      expect(swapped.receiverZone).toBe(normal.receiverZone);
    }
  });

  it('setup: teamA left, teamB right in their service boxes', () => {
    expect(sqSetupPlacement('teamA', false).zone).toBe('backLeft');
    expect(sqSetupPlacement('teamB', false).zone).toBe('backRight');
    expect(sqSetupPlacement('teamA', true).zone).toBe('backRight');
  });

  it('scene service box highlights back service zones only', () => {
    const leftBox = sqSceneServiceBox('backLeft');
    const rightBox = sqSceneServiceBox('backRight');
    expect(sqBoxCenter('backLeft').x).toBeLessThan(sqBoxCenter('backRight').x);
    expect(leftBox).not.toBe(rightBox);
    expect(() => sqSceneServiceBox('shortLeft')).toThrow();
    const pl = sqServePlacement({ serverTeam: 'teamB', courtEndsSwapped: false, courtSide: 'rightDeuce' });
    expect(sqSceneServiceBox(pl.serverZone)).toBe(rightBox);
  });

  it('serve trace: ball → front wall → receiver with equal reflection', () => {
    const pl = sqServePlacement({ serverTeam: 'teamA', courtEndsSwapped: false, courtSide: 'rightDeuce' });
    const trace = sqSceneServeOverlay({
      serverZone: pl.serverZone,
      receiverZone: pl.receiverZone,
    });
    expect(trace.ball.y).toBeLessThan(pl.server.y);
    expect(pl.server.y - trace.ball.y).toBeGreaterThanOrEqual(SQ_SERVE_BALL_MIN_SCREEN_GAP - 0.5);
    expect(trace.leg2.to).toEqual(trace.receiveBall);
    expect(trace.leg2.from).toEqual(trace.wallHit);
    const dx1 = trace.wallHit.x - trace.leg1.from.x;
    const dy1 = trace.wallHit.y - trace.leg1.from.y;
    const dx2 = trace.leg2.to.x - trace.wallHit.x;
    const dy2 = trace.leg2.to.y - trace.wallHit.y;
    expect(Math.sign(dx1)).toBe(Math.sign(dx2));
    expect(Math.abs(dx2 / dy2)).toBeCloseTo(Math.abs(dx1 / dy1), 5);
    expect(dy1).toBeLessThan(0);
    expect(dy2).toBeGreaterThan(0);
  });

  it('perspective: front narrower than back, depth increases downward', () => {
    const front = sqProject(SQ_HALF_X, 0);
    const back = sqProject(SQ_HALF_X, SQ_COURT_L);
    expect(back.y).toBeGreaterThan(front.y);
    const frontW = sqProject(SQ_COURT_W, 0).x - sqProject(0, 0).x;
    const backW = sqProject(SQ_COURT_W, SQ_COURT_L).x - sqProject(0, SQ_COURT_L).x;
    expect(backW).toBeGreaterThan(frontW);
  });
});
