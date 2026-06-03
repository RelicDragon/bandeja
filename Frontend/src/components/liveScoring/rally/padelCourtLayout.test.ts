import { describe, expect, it } from 'vitest';
import { pdServeFlatPoints, pdServerEnd } from './padelCourtGeometry';
import { pdProjectFlat, pdSceneBallNearPovFromServer, pdSceneServeBallPt } from './padelCourtLayout';

describe('padelCourtLayout serve ball', () => {
  const opts = {
    serverTeam: 'teamB' as const,
    courtSide: 'rightDeuce' as const,
    courtEndsSwapped: false,
    matchDoubles: false,
  };

  it('far end (top server): ball uses flat projection only', () => {
    const flat = pdServeFlatPoints({ ...opts, serverTeam: 'teamB' });
    const serverEnd = pdServerEnd('teamB', false);
    expect(serverEnd).toBe('top');
    const serverPt = pdProjectFlat(flat.start.x, 195);
    const ballPt = pdSceneServeBallPt(flat.start, serverEnd, {
      px: serverPt.x,
      py: serverPt.y,
      avatarScale: 1,
    });
    const flatBall = pdProjectFlat(flat.start.x, flat.start.y);
    expect(ballPt.x).toBeCloseTo(flatBall.x, 1);
    expect(ballPt.y).toBeCloseTo(flatBall.y, 1);
  });

  it('near end (bottom server): may nudge from collapsed projection', () => {
    const flat = pdServeFlatPoints({ ...opts, serverTeam: 'teamA' });
    const serverEnd = pdServerEnd('teamA', false);
    expect(serverEnd).toBe('bottom');
    const serverPt = pdProjectFlat(flat.start.x, 195);
    const flatBall = pdProjectFlat(flat.start.x, flat.start.y);
    const nudged = pdSceneBallNearPovFromServer(serverPt.x, serverPt.y, 1.35, flatBall);
    expect(nudged.x).toBeCloseTo(serverPt.x, 1);
    expect(Math.abs(nudged.y - serverPt.y)).toBeGreaterThanOrEqual(10);
  });
});
