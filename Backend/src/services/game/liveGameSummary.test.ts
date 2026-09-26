/**
 * PRD 349 — live-score derivation. Pure: no DB, no env.
 *
 * Run: `ts-node --transpile-only src/services/game/liveGameSummary.test.ts`
 */
import assert from 'node:assert/strict';
import type { BasicUser } from '../../types/user.types';
import {
  buildFinalGameSummary,
  buildLiveGameSummary,
  formatSetScoreLine,
  leadingTeamNumber,
  liveEnvelopeUpdatedAtMs,
  readActiveSetIndex,
  readCurrentGameScores,
  readLiveSummarySets,
} from './liveGameSummary';

function player(id: string, firstName: string): BasicUser {
  return {
    id,
    firstName,
    lastName: null,
    avatar: null,
    level: 3,
    socialLevel: 0,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
  };
}

function envelope(state: unknown, revision = 7, updatedAt = '2026-09-20T10:00:00.000Z') {
  return { liveScoring: { v: 1, revision, updatedAt, state } };
}

const classicState = {
  mode: 'classic',
  activeSetIndex: 1,
  sets: [
    { teamA: 6, teamB: 4 },
    { teamA: 3, teamB: 2 },
  ],
  classic: {
    pointState: { kind: 'regular', teamA: 40, teamB: 15 },
    withinSetTieBreak: false,
    tieBreakA: 0,
    tieBreakB: 0,
    classicPointsPlayedInGame: 4,
    deuceCount: 0,
  },
};

/* ---------------- set + index reading ---------------- */
{
  assert.deepEqual(readLiveSummarySets(classicState), [
    { teamA: 6, teamB: 4, isTieBreak: false },
    { teamA: 3, teamB: 2, isTieBreak: false },
  ]);
  assert.deepEqual(readLiveSummarySets(null), []);
  assert.deepEqual(readLiveSummarySets({ sets: 'nope' }), []);

  // Garbage scores clamp instead of leaking NaN into the card.
  assert.deepEqual(readLiveSummarySets({ sets: [{ teamA: 'x', teamB: -5 }] }), [
    { teamA: 0, teamB: 0, isTieBreak: false },
  ]);

  assert.equal(readActiveSetIndex(classicState, 2), 1);
  // Out-of-range activeSetIndex clamps into the sets array.
  assert.equal(readActiveSetIndex({ activeSetIndex: 9 }, 2), 1);
  assert.equal(readActiveSetIndex({}, 3), 2);
}

/* ---------------- point rendering ---------------- */
{
  assert.deepEqual(readCurrentGameScores(classicState), ['40', '15']);
  assert.deepEqual(
    readCurrentGameScores({ classic: { pointState: { kind: 'deuce' } } }),
    ['40', '40'],
  );
  assert.deepEqual(
    readCurrentGameScores({ classic: { pointState: { kind: 'advantage', side: 'teamA' } } }),
    ['AD', '40'],
  );
  assert.deepEqual(
    readCurrentGameScores({ classic: { pointState: { kind: 'advantage', side: 'teamB' } } }),
    ['40', 'AD'],
  );
  assert.deepEqual(
    readCurrentGameScores({
      classic: { withinSetTieBreak: true, tieBreakA: 5, tieBreakB: 7 },
    }),
    ['5', '7'],
  );
  // `points` mode (americano) has no sub-game score at all.
  assert.deepEqual(readCurrentGameScores({ mode: 'points', sets: [] }), ['', '']);
}

/* ---------------- leading side ---------------- */
{
  // Sets win it outright.
  assert.equal(
    leadingTeamNumber(
      [
        { teamA: 6, teamB: 4, isTieBreak: false },
        { teamA: 1, teamB: 5, isTieBreak: false },
      ],
      1,
      ['0', '0'],
    ),
    1,
  );
  // Level on sets → games in the running set decide.
  assert.equal(
    leadingTeamNumber(
      [
        { teamA: 6, teamB: 4, isTieBreak: false },
        { teamA: 2, teamB: 6, isTieBreak: false },
        { teamA: 1, teamB: 3, isTieBreak: false },
      ],
      2,
      ['0', '0'],
    ),
    2,
  );
  // Level on sets and games → the point decides.
  assert.equal(
    leadingTeamNumber([{ teamA: 3, teamB: 3, isTieBreak: false }], 0, ['AD', '40']),
    1,
  );
  // Dead level → nobody glows.
  assert.equal(
    leadingTeamNumber([{ teamA: 3, teamB: 3, isTieBreak: false }], 0, ['40', '40']),
    0,
  );
}

/* ---------------- full summary ---------------- */
{
  const summary = buildLiveGameSummary({
    matchId: 'match-1',
    metadata: envelope(classicState, 12),
    courtName: 'Court 3',
    startedAt: new Date('2026-09-20T09:30:00.000Z'),
    teams: [
      { teamNumber: 1, players: [player('u1', 'Marko'), player('u2', 'Ana')] },
      { teamNumber: 2, players: [player('u3', 'Luka'), player('u4', 'Ivan')] },
    ],
  });

  assert.ok(summary);
  assert.equal(summary.matchId, 'match-1');
  assert.equal(summary.courtName, 'Court 3');
  assert.equal(summary.currentSet, 2);
  assert.equal(summary.startedAt, '2026-09-20T09:30:00.000Z');

  // The monotonic revision must survive: the rail drops any socket frame that
  // is not newer than what it already shows.
  assert.equal(summary.revision, 12);

  assert.equal(summary.sides.length, 2);
  const [a, b] = summary.sides;
  assert.equal(a.teamNumber, 1);
  assert.equal(b.teamNumber, 2);
  assert.deepEqual(a.setScores, [6, 3]);
  assert.deepEqual(b.setScores, [4, 2]);
  assert.equal(a.currentGameScore, '40');
  assert.equal(b.currentGameScore, '15');
  assert.equal(a.leading, true);
  assert.equal(b.leading, false);
  assert.deepEqual(
    a.players.map((p) => p.firstName),
    ['Marko', 'Ana'],
  );

  assert.equal(formatSetScoreLine(summary), '6-4 3-2');
}

/* ---------------- nothing to show ---------------- */
{
  const noEnvelope = buildLiveGameSummary({
    matchId: 'm',
    metadata: { other: true },
    teams: [],
  });
  assert.equal(noEnvelope, null);

  const clearedState = buildLiveGameSummary({
    matchId: 'm',
    metadata: envelope(null),
    teams: [],
  });
  assert.equal(clearedState, null);

  const legacyBlob = buildLiveGameSummary({
    matchId: 'm',
    metadata: { liveScoring: { sets: [{ teamA: 1, teamB: 0 }] } },
    teams: [],
  });
  assert.equal(legacyBlob, null, 'an envelope without v/revision/updatedAt is not usable');

  // A side with no team row still renders — the card shows an empty stack
  // rather than disappearing.
  const missingTeam = buildLiveGameSummary({
    matchId: 'm',
    metadata: envelope(classicState),
    teams: [{ teamNumber: 1, players: [player('u1', 'Solo')] }],
  });
  assert.ok(missingTeam);
  assert.deepEqual(missingTeam.sides[1].players, []);
}

/* ---------------- freshness ---------------- */
{
  assert.equal(
    liveEnvelopeUpdatedAtMs(envelope(classicState, 1, '2026-09-20T10:00:00.000Z')),
    Date.parse('2026-09-20T10:00:00.000Z'),
  );
  assert.equal(liveEnvelopeUpdatedAtMs(null), 0);
  assert.equal(liveEnvelopeUpdatedAtMs({ liveScoring: { v: 1, revision: 1, updatedAt: 'nope' } }), 0);
}

/* ---------------- final (normal results entry) ---------------- */
{
  const teams = [
    { teamNumber: 1, players: [player('a', 'Marko'), player('b', 'Ana')] },
    { teamNumber: 2, players: [player('c', 'Luka'), player('d', 'Ivan')] },
  ];

  // Stored winner wins, every set is shown, nothing is "in play".
  const final = buildFinalGameSummary({
    matchId: 'm1',
    teams,
    sets: [
      { teamAScore: 4, teamBScore: 6 },
      { teamAScore: 6, teamBScore: 3 },
      { teamAScore: 10, teamBScore: 8 },
      { teamAScore: 0, teamBScore: 0 },
    ],
    winnerTeamNumber: 1,
  });
  assert.ok(final);
  assert.deepEqual(final.sides[0].setScores, [4, 6, 10], 'empty trailing sets dropped');
  assert.deepEqual(final.sides[1].setScores, [6, 3, 8]);
  assert.equal(final.sides[0].leading, true);
  assert.equal(final.sides[1].leading, false);
  assert.equal(final.sides[0].currentGameScore, '');
  assert.equal(final.currentSet, 3);
  assert.equal(final.revision, undefined, 'a finished card never takes socket frames');

  // No stored winner: sets won decide.
  const bySets = buildFinalGameSummary({
    matchId: 'm2',
    teams,
    sets: [
      { teamAScore: 3, teamBScore: 6 },
      { teamAScore: 4, teamBScore: 6 },
    ],
  });
  assert.equal(bySets?.sides[1].leading, true);

  // Level on sets (single-set formats, points modes): games decide.
  const byGames = buildFinalGameSummary({
    matchId: 'm3',
    teams,
    sets: [{ teamAScore: 21, teamBScore: 17 }],
  });
  assert.equal(byGames?.sides[0].leading, true);

  assert.equal(
    buildFinalGameSummary({ matchId: 'm4', teams, sets: [{ teamAScore: 0, teamBScore: 0 }] }),
    null,
    'nothing scored',
  );
  assert.equal(
    buildFinalGameSummary({ matchId: 'm5', teams: [teams[0]], sets: [{ teamAScore: 6, teamBScore: 2 }] }),
    null,
    'one side missing',
  );
}

console.log('liveGameSummary.test.ts: ok');
