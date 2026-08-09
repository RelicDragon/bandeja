import assert from 'node:assert/strict';
import { PlayerLevelVerdict } from '@prisma/client';
import {
  aggregateLevelFeedback,
  roundVerdictPercentages,
  sharedOpponentIds,
} from './playerLevelEvaluation.service';

const counts = {
  [PlayerLevelVerdict.LOWER]: 1,
  [PlayerLevelVerdict.ABOUT_RIGHT]: 1,
  [PlayerLevelVerdict.HIGHER]: 1,
};
const percentages = roundVerdictPercentages(counts);
assert.equal(Object.values(percentages).reduce((sum, value) => sum + value, 0), 100);
assert.deepEqual(percentages, {
  [PlayerLevelVerdict.LOWER]: 33,
  [PlayerLevelVerdict.ABOUT_RIGHT]: 33,
  [PlayerLevelVerdict.HIGHER]: 34,
});

const belowThreshold = aggregateLevelFeedback([
  { verdict: PlayerLevelVerdict.HIGHER, evaluatorUserId: 'u1', gameId: 'g1' },
  { verdict: PlayerLevelVerdict.HIGHER, evaluatorUserId: 'u2', gameId: 'g1' },
  { verdict: PlayerLevelVerdict.ABOUT_RIGHT, evaluatorUserId: 'u3', gameId: 'g2' },
  { verdict: PlayerLevelVerdict.LOWER, evaluatorUserId: 'u4', gameId: 'g3' },
]);
assert.deepEqual(belowThreshold, { available: false });

const aggregate = aggregateLevelFeedback([
  { verdict: PlayerLevelVerdict.HIGHER, evaluatorUserId: 'u1', gameId: 'g1' },
  { verdict: PlayerLevelVerdict.HIGHER, evaluatorUserId: 'u2', gameId: 'g1' },
  { verdict: PlayerLevelVerdict.HIGHER, evaluatorUserId: 'u3', gameId: 'g2' },
  { verdict: PlayerLevelVerdict.ABOUT_RIGHT, evaluatorUserId: 'u4', gameId: 'g2' },
  { verdict: PlayerLevelVerdict.LOWER, evaluatorUserId: 'u5', gameId: 'g3' },
]);
assert.equal(aggregate.available, true);
if (aggregate.available) {
  assert.equal(aggregate.totalEvaluations, 5);
  assert.equal(aggregate.totalGames, 3);
  assert.equal(aggregate.distinctEvaluators, 5);
  assert.deepEqual(aggregate.percentages, {
    [PlayerLevelVerdict.LOWER]: 20,
    [PlayerLevelVerdict.ABOUT_RIGHT]: 20,
    [PlayerLevelVerdict.HIGHER]: 60,
  });
}

assert.deepEqual(
  [...sharedOpponentIds('u1', [
    {
      teams: [
        { players: [{ userId: 'u1' }, { userId: 'u2' }] },
        { players: [{ userId: 'u3' }, { userId: 'u4' }] },
      ],
    },
    {
      teams: [
        { players: [{ userId: 'u5' }] },
        { players: [{ userId: 'u6' }] },
      ],
    },
  ])].sort(),
  ['u2', 'u3', 'u4'],
  'only players who shared a recorded match are eligible',
);

console.log('playerLevelEvaluation.test: ok');
