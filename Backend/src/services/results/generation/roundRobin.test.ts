import assert from 'node:assert/strict';
import { generateRoundRobinRound } from './roundRobin';
import type { GenGame, GenRound } from './types';

function baseGame(overrides: Partial<GenGame> = {}): GenGame {
  return {
    id: 'g1',
    matchGenerationType: 'ROUND_ROBIN',
    participants: [],
    gameCourts: [],
    hasFixedTeams: false,
    fixedTeams: [],
    playersPerMatch: 4,
    maxParticipants: 8,
    genderTeams: 'ANY',
    ...overrides,
  } as GenGame;
}

function playing(userId: string, gender = 'MALE') {
  return {
    userId,
    status: 'PLAYING',
    user: { id: userId, level: 3, gender, firstName: userId },
  };
}

function assertDisjointTeams(matches: ReturnType<typeof generateRoundRobinRound>): void {
  for (const m of matches) {
    const sideA = new Set(m.teamA);
    for (const id of m.teamB) {
      assert(!sideA.has(id), 'player cannot appear on both sides');
    }
  }
}

function testFourPlayerDoublesFullCycle(): void {
  const game = baseGame({
    participants: ['a', 'b', 'c', 'd'].map((id) => playing(id)),
    playersPerMatch: 4,
    maxParticipants: 4,
  });
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const rounds: GenRound[] = [];
  const seen = new Set<string>();

  for (let r = 0; r < 4; r++) {
    const matches = generateRoundRobinRound(game, rounds, initialSets);
    if (r < 3) {
      assert.equal(matches.length, 1, `round ${r + 1} has one match`);
      assertDisjointTeams(matches);
      const m = matches[0]!;
      const key = [...m.teamA].sort().join() + '|' + [...m.teamB].sort().join();
      assert(!seen.has(key), `duplicate matchup ${key}`);
      seen.add(key);
      rounds.push({ id: `r${r}`, matches });
    } else {
      assert.equal(matches.length, 0, 'fourth round is empty after full cycle');
    }
  }
  assert.equal(seen.size, 3, 'three unique pairings for 4 players');
}

function testSinglesEightPlayers(): void {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const game = baseGame({
    participants: ids.map((id) => playing(id)),
    playersPerMatch: 2,
    maxParticipants: 8,
    gameCourts: [
      { courtId: 'c1', order: 0 },
      { courtId: 'c2', order: 1 },
      { courtId: 'c3', order: 2 },
      { courtId: 'c4', order: 3 },
    ],
  });
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const rounds: GenRound[] = [];

  for (let r = 0; r < 7; r++) {
    const matches = generateRoundRobinRound(game, rounds, initialSets);
    assert.equal(matches.length, 4, `round ${r + 1} fills courts`);
    const used = new Set<string>();
    for (const m of matches) {
      assert.equal(m.teamA.length, 1);
      assert.equal(m.teamB.length, 1);
      used.add(m.teamA[0]!);
      used.add(m.teamB[0]!);
    }
    assert.equal(used.size, 8, 'all players play each round');
    rounds.push({ id: `r${r}`, matches });
  }

  const extra = generateRoundRobinRound(game, rounds, initialSets);
  assert.equal(extra.length, 0, 'cycle complete');
}

function testFixedTeamsFourTeams(): void {
  const game = baseGame({
    hasFixedTeams: true,
    participants: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => playing(id)),
    fixedTeams: [
      {
        id: 't1',
        teamNumber: 1,
        players: [
          { userId: 'a', user: { id: 'a', level: 3, gender: 'MALE' } },
          { userId: 'b', user: { id: 'b', level: 3, gender: 'MALE' } },
        ],
      },
      {
        id: 't2',
        teamNumber: 2,
        players: [
          { userId: 'c', user: { id: 'c', level: 3, gender: 'MALE' } },
          { userId: 'd', user: { id: 'd', level: 3, gender: 'MALE' } },
        ],
      },
      {
        id: 't3',
        teamNumber: 3,
        players: [
          { userId: 'e', user: { id: 'e', level: 3, gender: 'MALE' } },
          { userId: 'f', user: { id: 'f', level: 3, gender: 'MALE' } },
        ],
      },
      {
        id: 't4',
        teamNumber: 4,
        players: [
          { userId: 'g', user: { id: 'g', level: 3, gender: 'MALE' } },
          { userId: 'h', user: { id: 'h', level: 3, gender: 'MALE' } },
        ],
      },
    ],
    gameCourts: [{ courtId: 'c1', order: 0 }, { courtId: 'c2', order: 1 }],
  });
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const rounds: GenRound[] = [];
  const seen = new Set<string>();

  for (let r = 0; r < 4; r++) {
    const matches = generateRoundRobinRound(game, rounds, initialSets);
    if (r < 3) {
      assert.equal(matches.length, 2, `round ${r + 1} has two team matches`);
      for (const m of matches) {
        assert.equal(m.teamA.length, 2);
        assert.ok(m.fixedTeamIdA, 'fixed team id on side A');
        const key = [m.fixedTeamIdA, m.fixedTeamIdB].sort().join('|');
        assert(!seen.has(key), `duplicate team pairing ${key}`);
        seen.add(key);
      }
      rounds.push({ id: `r${r}`, matches });
    } else {
      assert.equal(matches.length, 0);
    }
  }
  assert.equal(seen.size, 6, '4 teams → 6 head-to-head pairings');
}

testFourPlayerDoublesFullCycle();
testSinglesEightPlayers();
testFixedTeamsFourTeams();
console.log('roundRobin.test.ts: ok');
