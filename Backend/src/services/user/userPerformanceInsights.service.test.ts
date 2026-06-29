import assert from 'node:assert/strict';
import { Gender, Sport } from '@prisma/client';
import {
  buildPerformanceRelationships,
  buildPerformanceStreaks,
  type RelationshipMatchInput,
  type StreakOutcomeInput,
} from './userPerformanceInsights.service';

const outcome = (
  result: 'win' | 'loss' | 'tie',
  index: number,
): StreakOutcomeInput => ({
  isWinner: result === 'win',
  wins: result === 'win' ? 1 : 0,
  ties: result === 'tie' ? 1 : 0,
  losses: result === 'loss' ? 1 : 0,
  createdAt: new Date(Date.UTC(2026, 0, index + 1)),
});

const user = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: '',
  avatar: null,
  primarySport: Sport.PADEL,
  sportsEnabled: [Sport.PADEL],
  sportProfiles: [],
  socialLevel: 0,
  gender: Gender.PREFER_NOT_TO_SAY,
  approvedLevel: false,
  isTrainer: false,
  verbalStatus: null,
  bio: null,
  isPremium: false,
  trainerRating: null,
  trainerReviewCount: 0,
  weeklyAvailability: null,
  availabilityBucketBoundaries: null,
});

const team = (id: string, players: ReturnType<typeof user>[]) => ({
  id,
  players: players.map((player) => ({ userId: player.id, user: player })),
});

const match = (
  winnerTeamId: string | null,
  teams: ReturnType<typeof team>[],
  ratingDelta?: number,
): RelationshipMatchInput<ReturnType<typeof user>> => ({
  winnerTeamId,
  ratingDelta,
  teams,
});

(() => {
  const streaks = buildPerformanceStreaks([
    outcome('win', 0),
    outcome('loss', 1),
    outcome('loss', 2),
    outcome('tie', 3),
    outcome('win', 4),
    outcome('win', 5),
    outcome('win', 6),
    outcome('loss', 7),
    outcome('loss', 8),
    outcome('loss', 9),
    outcome('loss', 10),
    outcome('tie', 11),
  ]);

  assert.deepEqual(streaks.recentGames, [
    'loss',
    'tie',
    'win',
    'win',
    'win',
    'loss',
    'loss',
    'loss',
    'loss',
    'tie',
  ]);
  assert.deepEqual(streaks.current, { result: 'tie', count: 1 });
  assert.equal(streaks.longestWin, 3);
  assert.equal(streaks.longestLoss, 4);
})();

(() => {
  const streaks = buildPerformanceStreaks([
    outcome('tie', 0),
    outcome('win', 1),
    outcome('win', 2),
    outcome('win', 3),
  ]);

  assert.deepEqual(streaks.current, { result: 'win', count: 3 });
  assert.equal(streaks.longestLoss, 0);
})();

(() => {
  const current = user('u-current', 'Current');
  const highWinPartner = user('u-high-win-partner', 'HighWin');
  const netBestPartner = user('u-net-best-partner', 'NetBest');
  const highLossPartner = user('u-high-loss-partner', 'HighLoss');
  const netWorstPartner = user('u-net-worst-partner', 'NetWorst');
  const opponentA = user('u-opponent-a', 'OpponentA');
  const opponentB = user('u-opponent-b', 'OpponentB');

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-high-win-1', [
        team('team-current-high-win-1', [current, highWinPartner]),
        team('team-opponents-1', [opponentA, opponentB]),
      ], 0.01),
      match('team-current-high-win-2', [
        team('team-current-high-win-2', [current, highWinPartner]),
        team('team-opponents-2', [opponentA, opponentB]),
      ], 0.01),
      match('team-current-net-best', [
        team('team-current-net-best', [current, netBestPartner]),
        team('team-opponents-3', [opponentA, opponentB]),
      ], 0.08),
      match('team-opponents-4', [
        team('team-current-high-loss-1', [current, highLossPartner]),
        team('team-opponents-4', [opponentA, opponentB]),
      ], -0.01),
      match('team-opponents-5', [
        team('team-current-high-loss-2', [current, highLossPartner]),
        team('team-opponents-5', [opponentA, opponentB]),
      ], -0.01),
      match('team-opponents-6', [
        team('team-current-net-worst', [current, netWorstPartner]),
        team('team-opponents-6', [opponentA, opponentB]),
      ], -0.08),
    ],
    Sport.PADEL,
  );

  assert.ok(relationships.bestPartner);
  assert.equal(relationships.bestPartner.user.id, highWinPartner.id);
  assert.equal(relationships.bestPartner.ratingNetChange, 0.02);
  assert.ok(relationships.worstPartner);
  assert.equal(relationships.worstPartner.user.id, highLossPartner.id);
  assert.equal(relationships.worstPartner.ratingNetChange, -0.02);
  assert.ok(relationships.bestPartnerByRating);
  assert.equal(relationships.bestPartnerByRating.user.id, netBestPartner.id);
  assert.equal(relationships.bestPartnerByRating.ratingNetChange, 0.08);
  assert.ok(relationships.worstPartnerByRating);
  assert.equal(relationships.worstPartnerByRating.user.id, netWorstPartner.id);
  assert.equal(relationships.worstPartnerByRating.ratingNetChange, -0.08);
})();

(() => {
  const current = user('u-current', 'Current');
  const strongPartner = user('u-strong-partner', 'Strong');
  const weakPartner = user('u-weak-partner', 'Weak');
  const favoriteTarget = user('u-target', 'Target');
  const nemesis = user('u-nemesis', 'Nemesis');
  const otherOpponent = user('u-other-opponent', 'Other');
  const oneVsOneOpponent = user('u-one-v-one', 'Singles');
  const volumePartner = user('u-volume-partner', 'Volume');

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-1', [
        team('team-current-1', [current, strongPartner]),
        team('team-target-1', [favoriteTarget, otherOpponent]),
      ]),
      match('team-current-2', [
        team('team-current-2', [current, strongPartner]),
        team('team-target-2', [favoriteTarget, nemesis]),
      ]),
      match('team-nemesis-1', [
        team('team-current-3', [current, weakPartner]),
        team('team-nemesis-1', [nemesis, otherOpponent]),
      ]),
      match('team-nemesis-2', [
        team('team-current-4', [current, weakPartner]),
        team('team-nemesis-2', [nemesis, favoriteTarget]),
      ]),
      match(null, [
        team('team-current-5', [current, weakPartner]),
        team('team-tie-1', [favoriteTarget, otherOpponent]),
      ]),
      match('team-current-singles', [
        team('team-current-singles', [current]),
        team('team-opponent-singles', [oneVsOneOpponent]),
      ]),
      match('team-current-6', [
        team('team-current-6', [current, volumePartner]),
        team('team-volume-opponent-1', [favoriteTarget, otherOpponent]),
      ]),
      match('team-volume-opponent-2', [
        team('team-current-7', [current, volumePartner]),
        team('team-volume-opponent-2', [nemesis, otherOpponent]),
      ]),
      match('team-volume-opponent-3', [
        team('team-current-8', [current, volumePartner]),
        team('team-volume-opponent-3', [nemesis, favoriteTarget]),
      ]),
      match('team-volume-opponent-4', [
        team('team-current-9', [current, volumePartner]),
        team('team-volume-opponent-4', [oneVsOneOpponent, otherOpponent]),
      ]),
    ],
    Sport.PADEL,
  );

  assert.ok(relationships.bestPartner);
  assert.equal(relationships.bestPartner.user.id, strongPartner.id);
  assert.equal(relationships.bestPartner?.wins, 2);
  assert.equal(relationships.bestPartner?.losses, 0);
  assert.ok(relationships.worstPartner);
  assert.equal(relationships.worstPartner.user.id, volumePartner.id);
  assert.equal(relationships.worstPartner?.wins, 1);
  assert.equal(relationships.worstPartner?.losses, 3);
  assert.equal(relationships.worstPartner?.ties, 0);
  assert.ok(relationships.bestPartnerByCount);
  assert.equal(relationships.bestPartnerByCount.user.id, strongPartner.id);
  assert.ok(relationships.worstPartnerByCount);
  assert.equal(relationships.worstPartnerByCount.user.id, volumePartner.id);

  assert.ok(relationships.favoriteTarget);
  assert.equal(relationships.favoriteTarget.user.id, favoriteTarget.id);
  assert.equal(relationships.favoriteTarget?.wins, 3);
  assert.equal(relationships.favoriteTarget?.losses, 2);
  assert.equal(relationships.favoriteTarget?.ties, 1);
  assert.ok(relationships.nemesis);
  assert.equal(relationships.nemesis.user.id, nemesis.id);
  assert.equal(relationships.nemesis?.losses, 4);
  assert.equal(relationships.nemesis?.wins, 1);
  assert.equal(relationships.nemesis?.ties, 0);
  assert.ok(relationships.favoriteTargetByCount);
  assert.equal(relationships.favoriteTargetByCount.user.id, favoriteTarget.id);
  assert.ok(relationships.nemesisByCount);
  assert.equal(relationships.nemesisByCount.user.id, nemesis.id);
})();

(() => {
  const current = user('u-current', 'Current');
  const highImpactTarget = user('u-high-impact-target', 'ImpactTarget');
  const steadyTarget = user('u-steady-target', 'SteadyTarget');
  const highImpactNemesis = user('u-high-impact-nemesis', 'ImpactNemesis');
  const steadyNemesis = user('u-steady-nemesis', 'SteadyNemesis');

  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-current-steady-target-1', [
        team('team-current-steady-target-1', [current]),
        team('team-steady-target-1', [steadyTarget]),
      ], 0.01),
      match('team-current-steady-target-2', [
        team('team-current-steady-target-2', [current]),
        team('team-steady-target-2', [steadyTarget]),
      ], 0.01),
      match('team-current-impact-target-1', [
        team('team-current-impact-target-1', [current]),
        team('team-impact-target-1', [highImpactTarget]),
      ], 0.08),
      match(null, [
        team('team-current-impact-target-2', [current]),
        team('team-impact-target-2', [highImpactTarget]),
      ], 0.08),
      match('team-steady-nemesis-1', [
        team('team-current-steady-nemesis-1', [current]),
        team('team-steady-nemesis-1', [steadyNemesis]),
      ], -0.01),
      match('team-steady-nemesis-2', [
        team('team-current-steady-nemesis-2', [current]),
        team('team-steady-nemesis-2', [steadyNemesis]),
      ], -0.01),
      match('team-impact-nemesis-1', [
        team('team-current-impact-nemesis-1', [current]),
        team('team-impact-nemesis-1', [highImpactNemesis]),
      ], -0.08),
      match(null, [
        team('team-current-impact-nemesis-2', [current]),
        team('team-impact-nemesis-2', [highImpactNemesis]),
      ], -0.08),
    ],
    Sport.PADEL,
  );

  assert.ok(relationships.favoriteTarget);
  assert.equal(relationships.favoriteTarget.user.id, highImpactTarget.id);
  assert.equal(relationships.favoriteTarget.ratingNetChange, 0.16);
  assert.ok(relationships.favoriteTargetByRating);
  assert.equal(relationships.favoriteTargetByRating.user.id, highImpactTarget.id);
  assert.ok(relationships.favoriteTargetByCount);
  assert.equal(relationships.favoriteTargetByCount.user.id, steadyTarget.id);
  assert.ok(relationships.nemesis);
  assert.equal(relationships.nemesis.user.id, highImpactNemesis.id);
  assert.equal(relationships.nemesis.ratingNetChange, -0.16);
  assert.ok(relationships.nemesisByRating);
  assert.equal(relationships.nemesisByRating.user.id, highImpactNemesis.id);
  assert.ok(relationships.nemesisByCount);
  assert.equal(relationships.nemesisByCount.user.id, steadyNemesis.id);
})();

(() => {
  const current = user('u-current', 'Current');
  const opponent = user('u-opponent', 'Opponent');
  const third = user('u-third', 'Third');
  const relationships = buildPerformanceRelationships(
    current.id,
    [
      match('team-opponent', [
        team('team-current', [current]),
        team('team-opponent', [opponent, third]),
      ]),
    ],
    Sport.PADEL,
  );

  assert.equal(relationships.favoriteTarget, null);
  assert.equal(relationships.nemesis, null);
})();

console.log('userPerformanceInsights.service tests passed');
