import assert from 'node:assert/strict';
import { MatchSetRole, PlayerLevelVerdict } from '@prisma/client';
import {
  aggregateLevelFeedback,
  isEvaluationStillEligible,
  roundVerdictPercentages,
  sharedOpponentIds,
} from './player-level-evaluation.service';

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
      sets: [{ teamAScore: 6, teamBScore: 4, role: MatchSetRole.OFFICIAL }],
    },
    {
      teams: [
        { players: [{ userId: 'u5' }] },
        { players: [{ userId: 'u6' }] },
      ],
      sets: [{ teamAScore: 6, teamBScore: 0, role: MatchSetRole.OFFICIAL }],
    },
    {
      teams: [
        { players: [{ userId: 'u1' }] },
        { players: [{ userId: 'u7' }] },
      ],
      sets: [{ teamAScore: 3, teamBScore: 2, role: MatchSetRole.EXTRA_GAMES }],
    },
    {
      teams: [
        { players: [{ userId: 'u1' }] },
        { players: [{ userId: 'u8' }] },
      ],
      sets: [{ teamAScore: 0, teamBScore: 0, role: MatchSetRole.OFFICIAL }],
    },
  ])].sort(),
  ['u2', 'u3', 'u4'],
  'only players who shared a recorded match are eligible',
);

const eligibleGame = {
  id: 'g1',
  participants: [{ userId: 'u1' }, { userId: 'u2' }],
  rounds: [{
    matches: [{
      teams: [
        { players: [{ userId: 'u1' }] },
        { players: [{ userId: 'u2' }] },
      ],
      sets: [{ teamAScore: 6, teamBScore: 2, role: MatchSetRole.OFFICIAL }],
    }],
  }],
};
assert.equal(
  isEvaluationStillEligible(
    { evaluatorUserId: 'u1', targetUserId: 'u2' },
    eligibleGame,
  ),
  true,
);
assert.equal(
  isEvaluationStillEligible(
    { evaluatorUserId: 'u1', targetUserId: 'u2' },
    { ...eligibleGame, participants: [{ userId: 'u1' }] },
  ),
  false,
  'a participant removed after finalization invalidates the vote',
);
assert.equal(
  isEvaluationStillEligible(
    { evaluatorUserId: 'u1', targetUserId: 'u2' },
    { ...eligibleGame, rounds: [] },
  ),
  false,
  'a removed shared match invalidates the vote',
);

console.log('playerLevelEvaluation.test: ok');
