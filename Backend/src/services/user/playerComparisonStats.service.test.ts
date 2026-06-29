import assert from 'node:assert/strict';
import { MatchSetRole } from '@prisma/client';
import {
  addScoredComparisonMatchStats,
  emptyComparisonRelationshipStats,
  type ComparisonMatchInput,
} from './playerComparisonStats.service';

const buckets = () => ({
  together: emptyComparisonRelationshipStats(),
  against: emptyComparisonRelationshipStats(),
});

const match = (
  winnerId: string | null,
  teamAPlayers: string[],
  teamBPlayers: string[],
  teamAScore = 6,
  teamBScore = 4,
  role: MatchSetRole = MatchSetRole.OFFICIAL,
): ComparisonMatchInput => ({
  winnerId,
  sets: [{ teamAScore, teamBScore, role }],
  teams: [
    { id: 'team-a', players: teamAPlayers.map((userId) => ({ userId })) },
    { id: 'team-b', players: teamBPlayers.map((userId) => ({ userId })) },
  ],
});

(() => {
  const stats = buckets();
  const relationship = addScoredComparisonMatchStats(
    stats,
    'current',
    'other',
    match('team-a', ['current', 'partner'], ['other', 'opponent']),
  );

  assert.equal(relationship, 'against');
  assert.deepEqual(stats.against, { total: 1, wins: 1, losses: 0, ties: 0 });
  assert.deepEqual(stats.together, { total: 0, wins: 0, losses: 0, ties: 0 });
})();

(() => {
  const stats = buckets();
  const relationship = addScoredComparisonMatchStats(
    stats,
    'current',
    'other',
    match(null, ['current', 'other'], ['opponent-a', 'opponent-b'], 6, 6),
  );

  assert.equal(relationship, 'together');
  assert.deepEqual(stats.together, { total: 1, wins: 0, losses: 0, ties: 1 });
})();

(() => {
  const stats = buckets();
  addScoredComparisonMatchStats(
    stats,
    'current',
    'other',
    match('team-a', ['current'], ['other'], 0, 0),
  );
  addScoredComparisonMatchStats(
    stats,
    'current',
    'other',
    match('team-a', ['current'], ['other'], 6, 4, MatchSetRole.EXTRA_GAMES),
  );

  assert.deepEqual(stats.against, { total: 0, wins: 0, losses: 0, ties: 0 });
})();

(() => {
  const stats = buckets();
  const relationship = addScoredComparisonMatchStats(
    stats,
    'current',
    'other',
    match('team-b', ['current'], ['other']),
    'against',
  );

  assert.equal(relationship, 'against');
  assert.deepEqual(stats.against, { total: 1, wins: 0, losses: 1, ties: 0 });
})();

