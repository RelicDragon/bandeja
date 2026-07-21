import assert from 'node:assert/strict';
import {
  compareHeadToHead,
  orderByRankedIds,
  rankFixedTeamGroupStandings,
  type RankFixture,
} from './leagueGroupStandingsRank.util';

function fix(
  aId: string,
  bId: string,
  winnerId: string | null,
  setsA: number,
  setsB: number,
  gamesA: number,
  gamesB: number
): RankFixture {
  return { aId, bId, winnerId, setsA, setsB, gamesA, gamesB };
}

function run() {
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 1 },
        { id: 'b', wins: 3 },
        { id: 'c', wins: 2 },
      ],
      []
    ),
    ['b', 'c', 'a']
  );

  // Two tied → H2H
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 2 },
        { id: 'b', wins: 2 },
        { id: 'c', wins: 1 },
      ],
      [fix('a', 'b', 'b', 2, 0, 12, 6)]
    ),
    ['b', 'a', 'c']
  );
  assert.equal(compareHeadToHead('a', 'b', [fix('a', 'b', 'a', 2, 1, 10, 8)]), -1);

  // Three tied → mini setDiff when mini wins equal
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 2 },
        { id: 'b', wins: 2 },
        { id: 'c', wins: 2 },
      ],
      [
        fix('a', 'b', 'a', 2, 0, 12, 4),
        fix('a', 'c', 'c', 0, 2, 4, 12),
        fix('b', 'c', 'b', 2, 1, 12, 10),
      ]
    ),
    ['c', 'a', 'b']
  );

  // Mini wins equal → setDiff
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 1 },
        { id: 'b', wins: 1 },
        { id: 'c', wins: 1 },
      ],
      [
        fix('a', 'b', 'a', 2, 1, 12, 10),
        fix('b', 'c', 'b', 2, 1, 12, 10),
        fix('c', 'a', 'c', 2, 0, 12, 3),
      ]
    ),
    ['c', 'b', 'a']
  );

  // Mini wins+set equal → gameDiff
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 1 },
        { id: 'b', wins: 1 },
        { id: 'c', wins: 1 },
      ],
      [
        fix('a', 'b', 'a', 2, 1, 14, 10),
        fix('b', 'c', 'b', 2, 1, 12, 10),
        fix('c', 'a', 'c', 2, 1, 12, 10),
      ]
    ),
    ['a', 'c', 'b']
  );

  // After mini, c separated by setDiff; a,b equal (no mutual match) → H2H inconclusive → stable id
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 2 },
        { id: 'b', wins: 2 },
        { id: 'c', wins: 2 },
      ],
      [
        fix('a', 'c', 'a', 2, 1, 12, 10),
        fix('b', 'c', 'b', 2, 1, 12, 10),
      ]
    ),
    ['a', 'b', 'c']
  );

  // Rule 4 with two-leg H2H: a,b equal on mini vs c; series a-b is 1-1 on wins but
  // set/game also equal → still tied. Use different setDiff in legs so mini already
  // splits — instead: after full mini among 3, subgroup {a,b} from equal mini vs worse c,
  // and a-b two legs where a wins series (2-0) while set/game vs c stay identical.
  // Wait: if a beat b twice, mini wins differ. So use: a and b never play; equal vs c;
  // that is inconclusive H2H. Documented.
  //
  // Decisive rule-4 path: four teams, mini among {a,b,c,d} leaves {a,b} equal and
  // {c},{d} separated; a beat b in their only meeting — but then mini wins wouldn't be equal
  // unless a-b result is excluded from mini (it isn't).
  //
  // Practical decisive case for resolvePair after mini: a,b equal on wins/set/game from
  // matches vs others only (no a-b fixture in cluster), then we call H2H which is null.
  // Covered above.
  //
  // Multi-leg where each won once: mini wins equal for a-b contribution; if set/game also
  // net equal, H2H series tied → stable.
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 3 },
        { id: 'b', wins: 3 },
        { id: 'c', wins: 1 },
      ],
      [
        fix('a', 'c', 'a', 2, 0, 12, 4),
        fix('b', 'c', 'b', 2, 0, 12, 4),
        fix('a', 'b', 'a', 2, 1, 12, 10),
        fix('a', 'b', 'b', 1, 2, 10, 12),
      ]
    ),
    // cluster wins: a,b at 3. Two-way H2H (rule 2) before mini: series 1-1 → stable a,b then c
    ['a', 'b', 'c']
  );

  // Two-way decisive H2H
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 2 },
        { id: 'b', wins: 2 },
        { id: 'c', wins: 0 },
      ],
      [
        fix('a', 'c', 'a', 2, 1, 10, 8),
        fix('b', 'c', 'b', 2, 1, 10, 8),
        fix('a', 'b', 'b', 1, 2, 8, 10),
      ]
    ),
    ['b', 'a', 'c']
  );

  // Recurse mini: among 3 equal wins, mini splits c out by setDiff; a,b remain equal → H2H
  // a vs c +2 sets, b vs c +1 set, a vs b draw on winner/sets/games
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 2 },
        { id: 'b', wins: 2 },
        { id: 'c', wins: 2 },
      ],
      [
        fix('a', 'c', 'a', 2, 0, 12, 6),
        fix('b', 'c', 'b', 2, 1, 12, 10),
        fix('a', 'b', null, 1, 1, 10, 10),
      ]
    ),
    // mini wins a1 b1 c0; setDiff a:+2-0=+2, b:+1-0=+1? wait a vs b 0 set contrib
    // a: vs c +2, vs b 0 → +2; b: vs c +1, vs a 0 → +1; c: -2-1=-3
    // ordered a, b, c — already split, no H2H needed
    ['a', 'b', 'c']
  );

  // Same setDiff for a,b vs c; draw between a,b → equal mini → H2H inconclusive → stable
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'z', wins: 2 },
        { id: 'y', wins: 2 },
        { id: 'x', wins: 2 },
      ],
      [
        fix('z', 'x', 'z', 2, 1, 12, 10),
        fix('y', 'x', 'y', 2, 1, 12, 10),
        fix('z', 'y', null, 1, 1, 10, 10),
      ]
    ),
    ['y', 'z', 'x']
  );

  // Rule 4: 3-way cluster; walkovers leave a,b equal on mini (wins/set/game) → H2H a above b
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 1 },
        { id: 'b', wins: 1 },
        { id: 'c', wins: 1 },
      ],
      [
        fix('a', 'b', 'a', 0, 0, 0, 0),
        fix('b', 'c', 'b', 0, 0, 0, 0),
      ]
    ),
    ['a', 'b', 'c']
  );

  assert.deepEqual(
    orderByRankedIds(
      [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
      ['z', 'x']
    ).map((r) => r.id),
    ['z', 'x', 'y']
  );

  console.log('leagueGroupStandingsRank.util.test.ts: ok');
}

run();
