import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RATING_LEADERBOARD_ACTIVITY_DAYS,
  RATING_LEADERBOARD_MIN_GAMES,
  compareRatingLeaderboardEntries,
  orderPlayedRatingLeaderboard,
  orderRatingLeaderboard,
  qualifiesForRatingRank,
  ratingLeaderboardActivitySince,
} from './ratingLeaderboardQualify';

assert.equal(RATING_LEADERBOARD_MIN_GAMES, 5);
assert.equal(RATING_LEADERBOARD_ACTIVITY_DAYS, 90);

assert.equal(
  qualifiesForRatingRank({ gamesPlayed: 5, hasRecentRatedGame: true }),
  true,
);
assert.equal(
  qualifiesForRatingRank({ gamesPlayed: 4, hasRecentRatedGame: true }),
  false,
);
assert.equal(
  qualifiesForRatingRank({ gamesPlayed: 20, hasRecentRatedGame: false }),
  false,
);
assert.equal(
  qualifiesForRatingRank({ gamesPlayed: 1, hasRecentRatedGame: false }),
  false,
);

const now = Date.parse('2026-08-20T00:00:00.000Z');
const since = ratingLeaderboardActivitySince(now);
assert.equal(since.toISOString(), '2026-05-22T00:00:00.000Z');

type Entry = {
  id: string;
  level: number;
  reliability: number;
  gamesWon: number;
  gamesPlayed: number;
  qualifiesForRating: boolean;
};

function entry(partial: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    level: 3,
    reliability: 50,
    gamesWon: 2,
    gamesPlayed: 6,
    qualifiesForRating: true,
    ...partial,
  };
}

const staleStar = entry({
  id: 'stale-star',
  level: 6,
  reliability: 90,
  gamesWon: 40,
  gamesPlayed: 40,
  qualifiesForRating: false,
});
const fewGames = entry({
  id: 'few-games',
  level: 5.5,
  reliability: 80,
  gamesWon: 4,
  gamesPlayed: 4,
  qualifiesForRating: false,
});
const qualifierB = entry({
  id: 'qual-b',
  level: 4.2,
  reliability: 60,
  gamesWon: 8,
  gamesPlayed: 12,
  qualifiesForRating: true,
});
const qualifierA = entry({
  id: 'qual-a',
  level: 4.5,
  reliability: 55,
  gamesWon: 6,
  gamesPlayed: 10,
  qualifiesForRating: true,
});
const includedLowGames = entry({
  id: 'played-once',
  level: 2,
  reliability: 10,
  gamesWon: 0,
  gamesPlayed: 1,
  qualifiesForRating: false,
});

const ordered = orderRatingLeaderboard([
  staleStar,
  fewGames,
  qualifierB,
  includedLowGames,
  qualifierA,
]);

assert.deepEqual(
  ordered.map((user) => user.id),
  ['qual-a', 'qual-b', 'stale-star', 'few-games', 'played-once'],
);
assert.equal(ordered.every((user) => user.gamesPlayed > 0), true);
assert.equal(ordered.find((user) => user.id === 'played-once')?.qualifiesForRating, false);
assert.equal(ordered[0]?.qualifiesForRating, true);
assert.equal(ordered[ordered.length - 1]?.qualifiesForRating, false);

const qualifierIds = ordered.filter((user) => user.qualifiesForRating).map((user) => user.id);
assert.deepEqual(qualifierIds, ['qual-a', 'qual-b']);
assert.equal(qualifierIds.indexOf('stale-star'), -1);

const rankById = new Map(qualifierIds.map((id, index) => [id, index + 1]));
assert.equal(rankById.get('qual-a'), 1);
assert.equal(rankById.get('qual-b'), 2);
assert.equal(rankById.has('stale-star'), false);
assert.equal(rankById.has('few-games'), false);
assert.equal(rankById.has('played-once'), false);

const tied = orderRatingLeaderboard([
  entry({ id: 'tie-b', level: 4, reliability: 50, gamesWon: 7, qualifiesForRating: true }),
  entry({ id: 'tie-a', level: 4, reliability: 50, gamesWon: 7, qualifiesForRating: true }),
  entry({ id: 'below', level: 6, qualifiesForRating: false, gamesPlayed: 2 }),
]);
assert.deepEqual(
  tied.map((user) => user.id),
  ['tie-a', 'tie-b', 'below'],
);
assert.equal(tied.filter((user) => user.qualifiesForRating).every((user) => user.id.startsWith('tie-')), true);

assert.ok(compareRatingLeaderboardEntries(qualifierA, qualifierB) < 0);

const cityOrdered = orderPlayedRatingLeaderboard([
  staleStar,
  fewGames,
  qualifierB,
  includedLowGames,
  qualifierA,
]);
assert.deepEqual(
  cityOrdered.map((user) => user.id),
  ['stale-star', 'few-games', 'qual-a', 'qual-b', 'played-once'],
);
assert.equal(cityOrdered[0]?.id, 'stale-star');

const rankingDir = __dirname;
const achievementSrc = readFileSync(join(rankingDir, 'achievementLeaderboard.service.ts'), 'utf8');
assert.equal(achievementSrc.includes('qualifiesForRatingRank'), false);
assert.equal(achievementSrc.includes('orderRatingLeaderboard'), false);
assert.equal(achievementSrc.includes('RATING_LEADERBOARD_MIN_GAMES'), false);

const rankingServiceSrc = readFileSync(join(rankingDir, '../ranking.service.ts'), 'utf8');
assert.equal(rankingServiceSrc.includes('affectsRating: true'), true);
assert.equal(rankingServiceSrc.includes('qualifyAndRankRatingLeaderboard'), true);
assert.equal(rankingServiceSrc.includes('getUserIdsWithRatedGameSince'), true);
assert.equal(rankingServiceSrc.includes('orderPlayedRatingLeaderboard'), true);
assert.equal(rankingServiceSrc.includes('Promise.all'), true);

const cityStart = rankingServiceSrc.indexOf('static async getCityLeaderboardRanks');
const cityEnd = rankingServiceSrc.indexOf('static async getUserIdsWithRatedGameSince', cityStart);
assert.ok(cityStart > 0 && cityEnd > cityStart);
const cityRanksFn = rankingServiceSrc.slice(cityStart, cityEnd);
assert.equal(cityRanksFn.includes('qualifyAndRankRatingLeaderboard'), false);
assert.equal(cityRanksFn.includes('orderPlayedRatingLeaderboard'), true);

const recentStart = rankingServiceSrc.indexOf('static async getUserIdsWithRatedGameSince(');
const recentEnd = rankingServiceSrc.indexOf('static async getUserIdsWithRatedGameSinceBySport', recentStart);
assert.ok(recentStart > 0 && recentEnd > recentStart);
const recentFn = rankingServiceSrc.slice(recentStart, recentEnd);
assert.equal(recentFn.includes('userId: { in: userIds }'), false);
assert.equal(recentFn.includes('startTime: { gte: since }'), true);
assert.equal(recentFn.includes('affectsRating: true'), true);

const controllerSrc = readFileSync(join(rankingDir, '../../controllers/ranking.controller.ts'), 'utf8');
const gamesBranch = controllerSrc.slice(controllerSrc.indexOf('if (isGames)'));
const gamesEnd = gamesBranch.indexOf('} else if (usePerSportLevel');
assert.ok(gamesEnd > 0);
const gamesBlock = gamesBranch.slice(0, gamesEnd);
assert.equal(gamesBlock.includes('qualifyAndRankRatingLeaderboard'), false);
assert.equal(gamesBlock.includes('qualifiesForRating'), false);
assert.equal(controllerSrc.includes('qualifyAndRankRatingLeaderboard'), true);

console.log('ratingLeaderboardQualify: ok');
