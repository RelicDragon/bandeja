import { describe, expect, it } from 'vitest';
import { bdServeFlatTrace, bdSinglesBoxXForEnd, bdServerEnd } from './badmintonCourtGeometry';
import {
  pbPlayerXForSlot,
  pbServeFlatPoints,
  pbSinglesBoxXForEnd,
  pbServerEnd,
} from './pickleballCourtGeometry';
import { tnServeFlatTrace, tnSinglesBoxXForEnd, tnServerEnd } from './tennisCourtGeometry';
import {
  TT_LEFT_X,
  TT_RIGHT_X,
  ttDoublesSlotXForEnd,
  ttServeFlatTrace,
  ttServerEnd,
  ttSinglesBoxXForEnd,
} from './tableTennisCourtGeometry';

/** Cross-court (opposite screen X) on server vs receiver end. */
function expectCrossCourtDiagonal(
  startX: number,
  endX: number,
  serverEnd: 'top' | 'bottom',
  receiverEnd: 'top' | 'bottom',
  serveRight: boolean,
  singlesBoxX: (end: 'top' | 'bottom', serveRight: boolean) => number
) {
  expect(startX).toBe(singlesBoxX(serverEnd, serveRight));
  expect(endX).toBe(singlesBoxX(receiverEnd, serveRight));
  expect(startX).not.toBe(endX);
}

describe('2v2 serve direction', () => {
  it('tennis doubles: deuce serve crosses to opposite service box', () => {
    const serveRight = true;
    const serverEnd = tnServerEnd('teamB', false);
    const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
    const trace = tnServeFlatTrace({
      serverTeam: 'teamB',
      courtEndsSwapped: false,
      serveRight,
      matchDoubles: true,
      serverPlayerIndex: 0,
    });
    expectCrossCourtDiagonal(trace.start.x, trace.end.x, serverEnd, receiverEnd, serveRight, tnSinglesBoxXForEnd);
  });

  it('badminton doubles: deuce serve crosses to opposite service box', () => {
    const serveRight = true;
    const serverEnd = bdServerEnd('teamB', false);
    const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
    const trace = bdServeFlatTrace({
      serverTeam: 'teamB',
      courtEndsSwapped: false,
      serveRight,
      matchDoubles: true,
      serverPlayerIndex: 0,
    });
    expectCrossCourtDiagonal(trace.start.x, trace.end.x, serverEnd, receiverEnd, serveRight, bdSinglesBoxXForEnd);
  });

  it('pickleball doubles: deuce serve crosses to opposite service box', () => {
    const serveRight = true;
    const serverEnd = pbServerEnd('teamA', false);
    const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
    const trace = pbServeFlatPoints({
      serverTeam: 'teamA',
      courtEndsSwapped: false,
      serveRight,
      matchDoubles: true,
      serverPlayerIndex: 0,
    });
    expectCrossCourtDiagonal(trace.start.x, trace.end.x, serverEnd, receiverEnd, serveRight, pbSinglesBoxXForEnd);

    const recvIdx = 0;
    const receiverSlotX = pbPlayerXForSlot(receiverEnd, recvIdx, true, serveRight, true, 0, serverEnd, {
      team: 'teamB',
      serverTeam: 'teamA',
      teamMirrored: false,
      endsSetup: false,
    });
    expect(receiverSlotX).toBe(trace.end.x);
    expect(receiverSlotX).not.toBe(trace.start.x);
  });

  it('table tennis doubles: serve stays on the same half (right-to-right)', () => {
    const serverEnd = ttServerEnd('teamB', false);
    const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
    const trace = ttServeFlatTrace({
      serverTeam: 'teamB',
      courtEndsSwapped: false,
      serveRight: true,
      matchDoubles: true,
      serverPlayerIndex: 0,
    });
    expect(trace.start.x).toBe(ttDoublesSlotXForEnd(serverEnd, 0));
    expect(trace.end.x).toBe(ttDoublesSlotXForEnd(receiverEnd, 1));
    expect(trace.start.x).toBe(TT_RIGHT_X);
    expect(trace.end.x).toBe(TT_RIGHT_X);
  });

  it('table tennis singles: deuce serve crosses court halves', () => {
    const serveRight = true;
    const serverEnd = ttServerEnd('teamA', false);
    const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
    const trace = ttServeFlatTrace({
      serverTeam: 'teamA',
      courtEndsSwapped: false,
      serveRight,
      matchDoubles: false,
      serverPlayerIndex: 0,
    });
    expectCrossCourtDiagonal(trace.start.x, trace.end.x, serverEnd, receiverEnd, serveRight, ttSinglesBoxXForEnd);
    expect(trace.start.x).toBe(TT_RIGHT_X);
    expect(trace.end.x).toBe(TT_LEFT_X);
  });
});
