import assert from 'node:assert/strict';
import {
  buildEqualWinsTieClusters,
  compareHeadToHead,
  computeParticipantGameDeltas,
  computeParticipantSetDeltas,
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

  const setDeltas = computeParticipantSetDeltas([
    fix('a', 'b', 'a', 2, 0, 12, 4),
    fix('a', 'c', 'c', 0, 2, 4, 12),
    fix('b', 'c', 'b', 2, 1, 12, 10),
  ]);
  assert.equal(setDeltas.get('a'), 0); // +2 + (-2)
  assert.equal(setDeltas.get('b'), -1); // -2 + 1
  assert.equal(setDeltas.get('c'), 1); // +2 + (-1)

  const gameDeltas = computeParticipantGameDeltas([
    fix('a', 'b', 'a', 2, 0, 12, 4),
    fix('a', 'c', 'c', 0, 2, 4, 12),
    fix('b', 'c', 'b', 2, 1, 12, 10),
  ]);
  assert.equal(gameDeltas.get('a'), 0); // +8 + (-8)
  assert.equal(gameDeltas.get('b'), -6); // -8 + 2
  assert.equal(gameDeltas.get('c'), 6); // +8 + (-2)

  // Mini-table cluster for 3 tied; exclude 0–0 unplayed from a 0-win cluster
  const miniClusters = buildEqualWinsTieClusters(
    [
      { id: 'a', wins: 2, losses: 1 },
      { id: 'b', wins: 2, losses: 1 },
      { id: 'c', wins: 2, losses: 1 },
      { id: 'd', wins: 0, losses: 0 },
      { id: 'e', wins: 0, losses: 2 },
      { id: 'f', wins: 0, losses: 1 },
    ],
    [
      fix('a', 'b', 'a', 2, 0, 12, 4),
      fix('a', 'c', 'c', 0, 2, 4, 12),
      fix('b', 'c', 'b', 2, 1, 12, 10),
      fix('e', 'f', 'e', 2, 0, 12, 6),
    ]
  );
  assert.equal(miniClusters.length, 2);
  assert.equal(miniClusters[0].seasonWins, 2);
  assert.deepEqual(
    miniClusters[0].rows.map((r) => r.participantId),
    ['c', 'a', 'b']
  );
  assert.equal(miniClusters[1].seasonWins, 0);
  assert.deepEqual(
    miniClusters[1].rows.map((r) => r.participantId),
    ['e', 'f']
  );
  assert.ok(!miniClusters.some((c) => c.rows.some((r) => r.participantId === 'd')));

  // Withdrawn cluster after all active; same H2H rules within withdrawn
  assert.deepEqual(
    rankFixedTeamGroupStandings(
      [
        { id: 'a', wins: 1, losses: 2 },
        { id: 'b', wins: 2, losses: 1 },
        { id: 'w1', wins: 0, losses: 3, withdrawn: true },
        { id: 'w2', wins: 1, losses: 2, withdrawn: true },
      ],
      [
        fix('a', 'b', 'b', 2, 0, 12, 6),
        fix('w1', 'w2', 'w2', 0, 0, 0, 0),
      ]
    ),
    ['b', 'a', 'w2', 'w1']
  );

  // Main-table order parks 0–0 after active 0-win teams; mini order matches active subset
  const zeroWinParts = [
    { id: 'a', wins: 0, losses: 1, ties: 0 },
    { id: 'b', wins: 0, losses: 1, ties: 0 },
    { id: 'c', wins: 0, losses: 0, ties: 0 },
  ];
  const zeroFx = [fix('a', 'b', 'a', 2, 0, 12, 4)];
  assert.deepEqual(
    rankFixedTeamGroupStandings(zeroWinParts, zeroFx),
    ['a', 'b', 'c']
  );
  const zeroCluster = buildEqualWinsTieClusters(zeroWinParts, zeroFx);
  assert.deepEqual(
    zeroCluster[0].rows.map((r) => r.participantId),
    ['a', 'b']
  );

  // 2-way: H2H match wins decide even when set Δ favors the loser
  const h2hFx = [
    fix('a', 'b', 'a', 0, 2, 4, 12),
    fix('a', 'b', 'a', 0, 2, 3, 12),
  ];
  const h2hParts = [
    { id: 'a', wins: 5, losses: 1, ties: 0 },
    { id: 'b', wins: 5, losses: 1, ties: 0 },
  ];
  assert.deepEqual(rankFixedTeamGroupStandings(h2hParts, h2hFx), ['a', 'b']);
  const h2hCluster = buildEqualWinsTieClusters(h2hParts, h2hFx);
  assert.deepEqual(
    h2hCluster[0].rows.map((r) => r.participantId),
    ['a', 'b']
  );
  assert.equal(h2hCluster[0].rows[0].miniWins, 2);
  assert.ok(h2hCluster[0].rows[0].setDiff < 0);

  console.log('leagueGroupStandingsRank.util.test.ts: ok');
}

run();
