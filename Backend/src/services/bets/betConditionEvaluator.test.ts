import assert from 'node:assert/strict';
import { MatchSetRole } from '@prisma/client';
import { evaluateBetCondition } from './betConditionEvaluator.service';

type GameResults = Parameters<typeof evaluateBetCondition>[1];

function makeBet(condition: Record<string, unknown>) {
  return {
    id: 'bet-1',
    creatorId: 'creator',
    condition,
  } as Parameters<typeof evaluateBetCondition>[0];
}

function baseResults(overrides: Partial<GameResults> = {}): GameResults {
  return {
    rounds: [],
    outcomes: [],
    fixedTeams: [],
    ...overrides,
  };
}

async function run() {
  // WIN_GAME
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'USER', entityId: 'u1' }),
      baseResults({ outcomes: [{ userId: 'u1', isWinner: true, wins: 2, losses: 0, ties: 0 }] }),
    );
    assert.equal(r.won, true);
  }
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'USER', entityId: 'u1' }),
      baseResults({ outcomes: [{ userId: 'u1', isWinner: false, wins: 0, losses: 2, ties: 0 }] }),
    );
    assert.equal(r.won, false);
  }

  // Non-participant: creator loses bet (acceptor wins) even though condition unmet
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'USER', entityId: 'missing' }),
      baseResults({ outcomes: [{ userId: 'u1', isWinner: true, wins: 1, losses: 0, ties: 0 }] }),
    );
    assert.equal(r.won, false);
    assert.equal(r.reason, 'User did not participate');
  }

  // Tied set does not count as won set
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_SET', entityType: 'USER', entityId: 'u1' }),
      baseResults({
        rounds: [{
          matches: [{
            teams: [
              { id: 't1', teamNumber: 1, playerIds: ['u1'], score: 0 },
              { id: 't2', teamNumber: 2, playerIds: ['u2'], score: 0 },
            ],
            sets: [{ teamAScore: 6, teamBScore: 6, role: MatchSetRole.OFFICIAL }],
            winnerId: null,
          }],
        }],
      }),
    );
    assert.equal(r.won, false);
  }

  const tiedSetMatch = {
    teams: [
      { id: 't1', teamNumber: 1, playerIds: ['u1'], score: 0 },
      { id: 't2', teamNumber: 2, playerIds: ['u2'], score: 0 },
    ],
    sets: [{ teamAScore: 6, teamBScore: 6, role: MatchSetRole.OFFICIAL }],
    winnerId: null,
  };

  // LOSE_SET / WIN_ALL / LOSE_ALL: tie-only match does not satisfy any set condition
  for (const predefined of ['LOSE_SET', 'WIN_ALL_SETS', 'LOSE_ALL_SETS'] as const) {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined, entityType: 'USER', entityId: 'u1' }),
      baseResults({ rounds: [{ matches: [tiedSetMatch] }] }),
    );
    assert.equal(r.won, false, `${predefined} fails on tie-only match`);
  }

  // LOSE_SET wins when every countable set is lost
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'LOSE_SET', entityType: 'USER', entityId: 'u1' }),
      baseResults({
        rounds: [{
          matches: [{
            teams: tiedSetMatch.teams,
            sets: [{ teamAScore: 4, teamBScore: 6, role: MatchSetRole.OFFICIAL }],
            winnerId: null,
          }],
        }],
      }),
    );
    assert.equal(r.won, true);
  }

  // WIN_ALL_SETS succeeds when all countable sets are won (ties ignored)
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_ALL_SETS', entityType: 'USER', entityId: 'u1' }),
      baseResults({
        rounds: [{
          matches: [{
            teams: tiedSetMatch.teams,
            sets: [
              { teamAScore: 6, teamBScore: 6, role: MatchSetRole.OFFICIAL },
              { teamAScore: 6, teamBScore: 4, role: MatchSetRole.OFFICIAL },
            ],
            winnerId: null,
          }],
        }],
      }),
    );
    assert.equal(r.won, true);
  }

  // WIN_ALL_SETS fails when any official set is lost
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_ALL_SETS', entityType: 'USER', entityId: 'u1' }),
      baseResults({
        rounds: [{
          matches: [{
            teams: tiedSetMatch.teams,
            sets: [
              { teamAScore: 6, teamBScore: 6, role: MatchSetRole.OFFICIAL },
              { teamAScore: 4, teamBScore: 6, role: MatchSetRole.OFFICIAL },
            ],
            winnerId: null,
          }],
        }],
      }),
    );
    assert.equal(r.won, false);
  }

  // Set conditions when target never played a match → void reason
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_SET', entityType: 'USER', entityId: 'missing' }),
      baseResults({
        outcomes: [{ userId: 'u1', isWinner: true, wins: 1, losses: 0, ties: 0 }],
        rounds: [{
          matches: [{
            teams: [
              { id: 't1', teamNumber: 1, playerIds: ['u1'], score: 0 },
              { id: 't2', teamNumber: 2, playerIds: ['u2'], score: 0 },
            ],
            sets: [{ teamAScore: 6, teamBScore: 4, role: MatchSetRole.OFFICIAL }],
            winnerId: 't1',
          }],
        }],
      }),
    );
    assert.equal(r.won, false);
    assert.equal(r.reason, 'User did not participate');
  }

  // Supplemental sets do not count toward set conditions
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_SET', entityType: 'USER', entityId: 'u1' }),
      baseResults({
        rounds: [{
          matches: [{
            teams: tiedSetMatch.teams,
            sets: [{ teamAScore: 6, teamBScore: 4, role: MatchSetRole.EXTRA_GAMES }],
            winnerId: null,
          }],
        }],
      }),
    );
    assert.equal(r.won, false);
  }

  // TEAM WIN_GAME reflects pair outcome when partners diverge
  {
    const divergent = baseResults({
      fixedTeams: [{ id: 'ft1', teamNumber: 1, playerIds: ['p1', 'p2'] }],
      outcomes: [
        { userId: 'p1', isWinner: false, wins: 0, losses: 2, ties: 0 },
        { userId: 'p2', isWinner: true, wins: 2, losses: 0, ties: 0 },
      ],
    });
    const win = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'TEAM', entityId: 'ft1' }),
      divergent,
    );
    assert.equal(win.won, true, 'TEAM WIN_GAME wins when pair won despite first player losing');
    const lose = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'LOSE_GAME', entityType: 'TEAM', entityId: 'ft1' }),
      divergent,
    );
    assert.equal(lose.won, false, 'TEAM LOSE_GAME fails when pair won');
  }

  // TEAM LOSE_GAME reflects pair outcome when first player individually won
  {
    const divergent = baseResults({
      fixedTeams: [{ id: 'ft1', teamNumber: 1, playerIds: ['p1', 'p2'] }],
      outcomes: [
        { userId: 'p1', isWinner: true, wins: 2, losses: 0, ties: 0, position: 3 },
        { userId: 'p2', isWinner: false, wins: 0, losses: 2, ties: 0, position: 3 },
      ],
    });
    const lose = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'LOSE_GAME', entityType: 'TEAM', entityId: 'ft1' }),
      divergent,
    );
    assert.equal(lose.won, true, 'TEAM LOSE_GAME wins when pair lost despite first player isWinner');
    const win = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'TEAM', entityId: 'ft1' }),
      divergent,
    );
    assert.equal(win.won, false, 'TEAM WIN_GAME fails when pair placement is not 1');
  }

  // TEAM WIN_GAME uses shared team position when present
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'TEAM', entityId: 'ft1' }),
      baseResults({
        fixedTeams: [{ id: 'ft1', teamNumber: 1, playerIds: ['p1', 'p2'] }],
        outcomes: [
          { userId: 'p1', isWinner: false, wins: 0, losses: 2, ties: 0, position: 1 },
          { userId: 'p2', isWinner: false, wins: 2, losses: 0, ties: 0, position: 1 },
        ],
      }),
    );
    assert.equal(r.won, true, 'TEAM WIN_GAME uses team position 1');
  }

  // TAKE_PLACE uses explicit position when present
  {
    const r = await evaluateBetCondition(
      makeBet({
        type: 'PREDEFINED',
        predefined: 'TAKE_PLACE',
        entityType: 'USER',
        entityId: 'u2',
        metadata: { place: 2 },
      }),
      baseResults({
        outcomes: [
          { userId: 'u1', isWinner: true, wins: 2, losses: 0, ties: 0, position: 1 },
          { userId: 'u2', isWinner: false, wins: 1, losses: 1, ties: 0, position: 2 },
        ],
      }),
    );
    assert.equal(r.won, true);
  }

  // TAKE_PLACE team fixed pair uses team placement, not first player only
  {
    const r = await evaluateBetCondition(
      makeBet({
        type: 'PREDEFINED',
        predefined: 'TAKE_PLACE',
        entityType: 'TEAM',
        entityId: 'ft1',
        metadata: { place: 2 },
      }),
      baseResults({
        fixedTeams: [{ id: 'ft1', teamNumber: 1, playerIds: ['p1', 'p2'] }],
        outcomes: [
          { userId: 'p1', isWinner: false, wins: 0, losses: 2, ties: 0, position: 4 },
          { userId: 'p2', isWinner: false, wins: 2, losses: 0, ties: 0, position: 2 },
        ],
      }),
    );
    assert.equal(r.won, true, 'TEAM TAKE_PLACE uses best team position among partners');
  }

  // TAKE_PLACE team without explicit position sorts fixed teams by aggregate wins
  {
    const r = await evaluateBetCondition(
      makeBet({
        type: 'PREDEFINED',
        predefined: 'TAKE_PLACE',
        entityType: 'TEAM',
        entityId: 'ft2',
        metadata: { place: 2 },
      }),
      baseResults({
        fixedTeams: [
          { id: 'ft1', teamNumber: 1, playerIds: ['p1', 'p2'] },
          { id: 'ft2', teamNumber: 2, playerIds: ['p3', 'p4'] },
        ],
        outcomes: [
          { userId: 'p1', isWinner: true, wins: 3, losses: 0, ties: 0 },
          { userId: 'p2', isWinner: false, wins: 1, losses: 2, ties: 0 },
          { userId: 'p3', isWinner: false, wins: 2, losses: 1, ties: 0 },
          { userId: 'p4', isWinner: false, wins: 0, losses: 3, ties: 0 },
        ],
      }),
    );
    assert.equal(r.won, true, 'TEAM TAKE_PLACE ranks fixed pairs by max partner wins');
  }

  // CUSTOM always fails automated evaluation
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'CUSTOM', customText: 'Buy drinks', entityType: 'USER', entityId: 'u1' }),
      baseResults(),
    );
    assert.equal(r.won, false);
    assert.match(r.reason ?? '', /manual review/i);
  }

  // Supplemental sets excluded from set conditions
  {
    const r = await evaluateBetCondition(
      makeBet({ type: 'PREDEFINED', predefined: 'WIN_SET', entityType: 'USER', entityId: 'u1' }),
      baseResults({
        rounds: [{
          matches: [{
            teams: [
              { id: 't1', teamNumber: 1, playerIds: ['u1'], score: 0 },
              { id: 't2', teamNumber: 2, playerIds: ['u2'], score: 0 },
            ],
            sets: [{ teamAScore: 10, teamBScore: 8, role: MatchSetRole.EXTRA_GAMES }],
            winnerId: 't1',
          }],
        }],
      }),
    );
    assert.equal(r.won, false, 'EXTRA_GAMES sets must not satisfy WIN_SET');
  }

  console.log('ok: betConditionEvaluator');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
