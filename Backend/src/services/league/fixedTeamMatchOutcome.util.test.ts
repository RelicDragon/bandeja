import assert from 'node:assert/strict';
import {
  buildFixedTeamScoreRows,
  pickChampionAndFinalistTeamNumbers,
  pickLosingFixedTeamNumber,
  pickWinningFixedTeamNumber,
} from './fixedTeamMatchOutcome.util';

{
  assert.equal(
    pickWinningFixedTeamNumber({
      teamCount: 2,
      scores: [
        { teamNumber: 1, wins: 2, isWinner: true },
        { teamNumber: 2, wins: 0, isWinner: false },
      ],
    }),
    1
  );
  assert.equal(
    pickLosingFixedTeamNumber({ teamNumbers: [1, 2], winningTeamNumber: 1 }),
    2
  );
}

{
  assert.equal(
    pickWinningFixedTeamNumber({
      teamCount: 2,
      scores: [
        { teamNumber: 1, wins: 0, isWinner: true },
        { teamNumber: 2, wins: 2, isWinner: false },
      ],
    }),
    1
  );
}

{
  assert.equal(
    pickWinningFixedTeamNumber({
      teamCount: 2,
      scores: [
        { teamNumber: 1, wins: 1, isWinner: false },
        { teamNumber: 2, wins: 1, isWinner: false },
      ],
    }),
    null
  );
}

{
  assert.equal(
    pickWinningFixedTeamNumber({
      teamCount: 2,
      scores: [{ teamNumber: 1, wins: 2, isWinner: true }],
    }),
    null
  );
}

{
  assert.equal(
    pickWinningFixedTeamNumber({
      teamCount: 2,
      scores: [
        { teamNumber: 1, wins: 2, isWinner: true },
        { teamNumber: 2, wins: 0, isWinner: true },
      ],
    }),
    null
  );
}

{
  assert.equal(
    pickWinningFixedTeamNumber({
      teamCount: 2,
      scores: [
        { teamNumber: 1, wins: 1, isWinner: false },
        { teamNumber: 2, wins: 2, isWinner: false },
      ],
    }),
    2
  );
  assert.equal(
    pickLosingFixedTeamNumber({ teamNumbers: [1, 2], winningTeamNumber: 2 }),
    1
  );
}

{
  const teams = [
    { teamNumber: 1, players: [{ userId: 'a' }, { userId: 'b' }] },
    { teamNumber: 2, players: [{ userId: 'c' }, { userId: 'd' }] },
  ];
  const outcomes = [
    { userId: 'a', wins: 2, isWinner: true },
    { userId: 'b', wins: 2, isWinner: true },
    { userId: 'c', wins: 0, isWinner: false },
    { userId: 'd', wins: 0, isWinner: false },
  ];
  const scores = buildFixedTeamScoreRows(teams, outcomes);
  assert.equal(scores.length, 2);
  const pair = pickChampionAndFinalistTeamNumbers({ fixedTeams: teams, outcomes });
  assert.deepEqual(pair, { winningTeamNumber: 1, losingTeamNumber: 2 });
}

{
  const pair = pickChampionAndFinalistTeamNumbers({
    fixedTeams: [
      { teamNumber: 1, players: [{ userId: 'a' }] },
      { teamNumber: 2, players: [{ userId: 'b' }] },
    ],
    outcomes: [
      { userId: 'a', wins: 0, isWinner: false },
      { userId: 'b', wins: 2, isWinner: false },
    ],
  });
  assert.deepEqual(pair, { winningTeamNumber: 2, losingTeamNumber: 1 });
}

console.log('fixedTeamMatchOutcome.util.test.ts: ok');
