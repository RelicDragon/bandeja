import { describe, expect, it } from 'vitest';
import {
  bdDoublesSlotXAtEnd,
  bdServerEnd,
  bdSinglesBoxXForEnd,
} from '@/components/liveScoring/rally/badmintonCourtGeometry';
import {
  badmintonCourtSideForServerScore,
  badmintonDoublesPlayerIndex,
  badmintonNextServerTeam,
} from './badmintonServe';
import { pickleballDoublesPlayerIndex } from './pickleballServe';
import type { LiveTeamSide } from './types';

type Court = 'left' | 'right';

type TeamState = { p0: Court; p1: Court };

/** Independent BWF Law 11.3 oracle — not derived from production code. */
function bwfOracle(
  log: LiveTeamSide[],
  firstForSet: LiveTeamSide,
  matchFirst: LiveTeamSide,
  matchFirstPlayerIdx: number,
): { serverTeam: LiveTeamSide; serverIdx: number; ta: number; tb: number } {
  const initCourts = (isFirstServerTeam: boolean, firstIdx: number): TeamState => {
    if (isFirstServerTeam) {
      return {
        p0: firstIdx === 0 ? 'right' : 'left',
        p1: firstIdx === 1 ? 'right' : 'left',
      };
    }
    return { p0: 'right', p1: 'left' };
  };

  let teamA = initCourts(matchFirst === 'teamA', matchFirst === 'teamA' ? matchFirstPlayerIdx : 0);
  let teamB = initCourts(matchFirst === 'teamB', matchFirst === 'teamB' ? matchFirstPlayerIdx : 0);
  const courts = (t: LiveTeamSide) => (t === 'teamA' ? teamA : teamB);
  const setCourts = (t: LiveTeamSide, c: TeamState) => {
    if (t === 'teamA') teamA = c;
    else teamB = c;
  };
  const swap = (c: TeamState): TeamState => ({ p0: c.p1, p1: c.p0 });
  const idxForScore = (c: TeamState, score: number): number => {
    const need: Court = score % 2 === 0 ? 'right' : 'left';
    if (c.p0 === need) return 0;
    if (c.p1 === need) return 1;
    return 0;
  };

  let ta = 0;
  let tb = 0;
  let serverTeam = firstForSet;
  let serverIdx = idxForScore(courts(serverTeam), 0);

  for (const winner of log) {
    if (winner === 'teamA') ta += 1;
    else tb += 1;
    if (winner === serverTeam) {
      setCourts(serverTeam, swap(courts(serverTeam)));
    } else {
      serverTeam = winner;
      const score = serverTeam === 'teamA' ? ta : tb;
      serverIdx = idxForScore(courts(serverTeam), score);
    }
  }
  return { serverTeam, serverIdx, ta, tb };
}

function logPrefixes(maxLen: number, seed: number): LiveTeamSide[][] {
  const out: LiveTeamSide[][] = [[]];
  let s = seed;
  for (let i = 0; i < maxLen; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const winner: LiveTeamSide = s % 2 === 0 ? 'teamA' : 'teamB';
    out.push([...out[out.length - 1]!, winner]);
  }
  return out;
}

describe('badmintonDoublesRotation oracle', () => {
  const configs: { firstForSet: LiveTeamSide; matchFirst: LiveTeamSide; firstIdx: number }[] = [
    { firstForSet: 'teamA', matchFirst: 'teamA', firstIdx: 0 },
    { firstForSet: 'teamA', matchFirst: 'teamA', firstIdx: 1 },
    { firstForSet: 'teamB', matchFirst: 'teamA', firstIdx: 0 },
    { firstForSet: 'teamB', matchFirst: 'teamA', firstIdx: 1 },
    { firstForSet: 'teamB', matchFirst: 'teamB', firstIdx: 1 },
  ];

  it.each(configs)(
    'matches BWF oracle for 40-point random sequences (%#)',
    ({ firstForSet, matchFirst, firstIdx }) => {
      for (const prefix of logPrefixes(40, 42 + firstIdx)) {
        const { ta, tb, serverTeam, serverIdx } = bwfOracle(prefix, firstForSet, matchFirst, firstIdx);
        const state = { pointWinnerLog: prefix };
        expect(badmintonNextServerTeam(state, firstForSet)).toBe(serverTeam);
        expect(badmintonDoublesPlayerIndex(state, firstForSet, matchFirst, firstIdx, ta, tb)).toBe(serverIdx);
        const score = serverTeam === 'teamA' ? ta : tb;
        const side = badmintonCourtSideForServerScore(score);
        const needRight = score % 2 === 0;
        expect(side).toBe(needRight ? 'rightDeuce' : 'leftAd');
      }
    },
  );

  it('BWF worked example: A holds twice, B side-out, A side-out after swaps', () => {
    const matchFirst: LiveTeamSide = 'teamA';
    const firstIdx = 1;
    const firstForSet: LiveTeamSide = 'teamA';
    const steps: { log: LiveTeamSide[]; idx: number; team: LiveTeamSide }[] = [
      { log: [], idx: 1, team: 'teamA' },
      { log: ['teamA'], idx: 1, team: 'teamA' },
      { log: ['teamA', 'teamA'], idx: 1, team: 'teamA' },
      { log: ['teamA', 'teamA', 'teamB'], idx: 1, team: 'teamB' },
      { log: ['teamA', 'teamA', 'teamB', 'teamA'], idx: 0, team: 'teamA' },
    ];
    for (const { log, idx, team } of steps) {
      const { ta, tb } = bwfOracle(log, firstForSet, matchFirst, firstIdx);
      const state = { pointWinnerLog: log };
      expect(badmintonDoublesPlayerIndex(state, firstForSet, matchFirst, firstIdx, ta, tb)).toBe(idx);
      expect(badmintonNextServerTeam(state, firstForSet)).toBe(team);
    }
  });

  it('diverges from pickleball static mapping after serving-team win streak + side-out', () => {
    const log: LiveTeamSide[] = ['teamA', 'teamA', 'teamB', 'teamA'];
    const state = { pointWinnerLog: log };
    expect(badmintonDoublesPlayerIndex(state, 'teamA', 'teamA', 1, 3, 1)).toBe(0);
    expect(pickleballDoublesPlayerIndex(state, 'teamA', 'teamA', 1, 3, 1)).toBe(1);
  });

  it('geometry: server slot sits in score-appropriate service box', () => {
    for (const prefix of logPrefixes(25, 99)) {
      const { ta, tb, serverTeam, serverIdx } = bwfOracle(prefix, 'teamA', 'teamA', 1);
      const score = serverTeam === 'teamA' ? ta : tb;
      const serveRight = score % 2 === 0;
      const serverEnd = bdServerEnd(serverTeam, false);
      const serverX = bdDoublesSlotXAtEnd(serverEnd, serverIdx, serverIdx, serveRight, true);
      expect(serverX).toBe(bdSinglesBoxXForEnd(serverEnd, serveRight));
    }
  });
});
