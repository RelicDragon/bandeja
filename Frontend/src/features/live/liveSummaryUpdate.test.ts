import { describe, expect, it } from 'vitest';
import type { LiveGameSummary } from '@/types';
import {
  applyLiveScoringFrame,
  formatSetScores,
  leadingTeamNumber,
  minutesSince,
  readEnvelopeActiveSetIndex,
  readEnvelopeGameScores,
  readEnvelopeRevision,
  readEnvelopeSets,
  sidePlayerNames,
} from './liveSummaryUpdate';

function player(id: string, firstName: string) {
  return {
    id,
    firstName,
    lastName: 'X',
    avatar: null,
    level: 3,
    socialLevel: 0,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
  } as unknown as LiveGameSummary['sides'][number]['players'][number];
}

function baseSummary(revision = 5): LiveGameSummary {
  return {
    matchId: 'match-1',
    courtName: 'court 3',
    currentSet: 2,
    sides: [
      {
        teamNumber: 1,
        players: [player('u1', 'Marko'), player('u2', 'Ana')],
        setScores: [6, 3],
        currentGameScore: '40',
        leading: true,
      },
      {
        teamNumber: 2,
        players: [player('u3', 'Luka'), player('u4', 'Ivan')],
        setScores: [4, 2],
        currentGameScore: '15',
        leading: false,
      },
    ],
    startedAt: '2026-09-20T11:37:00.000Z',
    revision,
  };
}

function envelope(revision: number, state: unknown) {
  return { v: 1, revision, updatedAt: '2026-09-20T12:00:00.000Z', state };
}

const stateAt = (sets: { teamA: number; teamB: number }[], activeSetIndex: number, point?: unknown) => ({
  mode: 'classic',
  activeSetIndex,
  sets,
  classic: {
    pointState: point ?? { kind: 'regular', teamA: 0, teamB: 0 },
    withinSetTieBreak: false,
    tieBreakA: 0,
    tieBreakB: 0,
  },
});

describe('envelope reading', () => {
  it('reads revision, sets, active index and the point score', () => {
    const env = envelope(9, stateAt([{ teamA: 6, teamB: 4 }, { teamA: 3, teamB: 3 }], 1));
    expect(readEnvelopeRevision(env)).toBe(9);
    expect(readEnvelopeSets(env)).toEqual([
      { teamA: 6, teamB: 4 },
      { teamA: 3, teamB: 3 },
    ]);
    expect(readEnvelopeActiveSetIndex(env, 2)).toBe(1);
    expect(readEnvelopeGameScores(env)).toEqual(['0', '0']);
  });

  it('renders deuce, advantage and tie-break points', () => {
    expect(readEnvelopeGameScores(envelope(1, stateAt([], 0, { kind: 'deuce' })))).toEqual([
      '40',
      '40',
    ]);
    expect(
      readEnvelopeGameScores(envelope(1, stateAt([], 0, { kind: 'advantage', side: 'teamB' }))),
    ).toEqual(['40', 'AD']);
    expect(
      readEnvelopeGameScores({
        v: 1,
        revision: 1,
        updatedAt: '',
        state: { classic: { withinSetTieBreak: true, tieBreakA: 5, tieBreakB: 7 } },
      }),
    ).toEqual(['5', '7']);
  });

  it('returns null revision for anything unreadable', () => {
    expect(readEnvelopeRevision(null)).toBeNull();
    expect(readEnvelopeRevision({ revision: 'nope' })).toBeNull();
    expect(readEnvelopeRevision('garbage')).toBeNull();
  });
});

describe('leadingTeamNumber', () => {
  it('prefers sets, then games, then the point', () => {
    expect(
      leadingTeamNumber([{ teamA: 6, teamB: 4 }, { teamA: 1, teamB: 2 }], 1, ['0', '0']),
    ).toBe(1);
    expect(leadingTeamNumber([{ teamA: 2, teamB: 5 }], 0, ['0', '0'])).toBe(2);
    expect(leadingTeamNumber([{ teamA: 3, teamB: 3 }], 0, ['AD', '40'])).toBe(1);
    expect(leadingTeamNumber([{ teamA: 3, teamB: 3 }], 0, ['40', '40'])).toBe(0);
  });
});

describe('applyLiveScoringFrame', () => {
  it('applies a newer frame and recomputes both sides', () => {
    const current = baseSummary(5);
    const next = applyLiveScoringFrame(current, {
      gameId: 'g1',
      matchId: 'match-1',
      liveScoring: envelope(
        6,
        stateAt([{ teamA: 6, teamB: 4 }, { teamA: 4, teamB: 2 }], 1, {
          kind: 'regular',
          teamA: 15,
          teamB: 0,
        }),
      ),
    });

    expect(next).not.toBe(current);
    expect(next.revision).toBe(6);
    expect(next.sides[0].setScores).toEqual([6, 4]);
    expect(next.sides[1].setScores).toEqual([4, 2]);
    expect(next.sides[0].currentGameScore).toBe('15');
    expect(next.sides[1].currentGameScore).toBe('0');
    expect(next.sides[0].leading).toBe(true);
    // Players, court and start time are card facts, not score facts.
    expect(next.sides[0].players).toBe(current.sides[0].players);
    expect(next.courtName).toBe('court 3');
    expect(next.startedAt).toBe(current.startedAt);
  });

  it('drops a late frame so a newer score is never overwritten', () => {
    const current = baseSummary(5);
    const stale = applyLiveScoringFrame(current, {
      gameId: 'g1',
      matchId: 'match-1',
      liveScoring: envelope(4, stateAt([{ teamA: 0, teamB: 0 }], 0)),
    });
    expect(stale).toBe(current);

    const sameRevision = applyLiveScoringFrame(current, {
      gameId: 'g1',
      matchId: 'match-1',
      liveScoring: envelope(5, stateAt([{ teamA: 0, teamB: 0 }], 0)),
    });
    expect(sameRevision).toBe(current);
  });

  it('ignores a frame for a different match', () => {
    const current = baseSummary(5);
    expect(
      applyLiveScoringFrame(current, {
        gameId: 'g1',
        matchId: 'other-match',
        liveScoring: envelope(99, stateAt([{ teamA: 0, teamB: 0 }], 0)),
      }),
    ).toBe(current);
  });

  it('freezes rather than blanking when the payload is unusable', () => {
    const current = baseSummary(5);
    for (const payload of [null, undefined, 'garbage', {}, envelope(9, null), envelope(9, { sets: [] })]) {
      expect(
        applyLiveScoringFrame(current, {
          gameId: 'g1',
          matchId: 'match-1',
          liveScoring: payload,
        }),
      ).toBe(current);
    }
  });
});

describe('formatting helpers', () => {
  it('formats set scores with an en dash', () => {
    expect(formatSetScores(baseSummary())).toBe('6–4, 3–2');
  });

  it('lists side players by first name', () => {
    expect(sidePlayerNames(baseSummary().sides[0])).toEqual(['Marko', 'Ana']);
  });

  it('measures whole minutes since the start, never negative', () => {
    const now = Date.parse('2026-09-20T12:00:00.000Z');
    expect(minutesSince('2026-09-20T11:37:00.000Z', now)).toBe(23);
    expect(minutesSince('2026-09-20T12:00:30.000Z', now)).toBe(0);
    expect(minutesSince(null, now)).toBeNull();
    expect(minutesSince('not-a-date', now)).toBeNull();
  });
});
