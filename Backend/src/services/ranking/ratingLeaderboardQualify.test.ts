import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RATING_LEADERBOARD_ACTIVITY_DAYS,
  RATING_LEADERBOARD_MIN_GAMES,
  compareRatingLeaderboardEntries,
  isRatingInactive,
  orderPlayedRatingLeaderboard,
  orderRatingLeaderboard,
  qualifiesForRatingRank,
  ratingInactiveAfterRatedFinish,
  ratingInactiveForRatedGame,
  ratingLeaderboardActivitySince,
  recentRatedParticipantWhere,
  selectRecentRatedUserIds,
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
assert.equal(isRatingInactive({ gamesPlayed: 5, hasRecentRatedGame: true }), false);
assert.equal(isRatingInactive({ gamesPlayed: 4, hasRecentRatedGame: true }), true);
assert.equal(ratingInactiveAfterRatedFinish(5), false);
assert.equal(ratingInactiveAfterRatedFinish(4), true);

const now = Date.parse('2026-08-20T00:00:00.000Z');
assert.equal(
  ratingInactiveForRatedGame(5, new Date('2026-08-01T00:00:00.000Z'), now),
  false,
);
assert.equal(
  ratingInactiveForRatedGame(5, new Date('2026-05-01T00:00:00.000Z'), now),
  true,
);
assert.equal(
  ratingInactiveForRatedGame(4, new Date('2026-08-01T00:00:00.000Z'), now),
  true,
);
assert.equal(ratingInactiveForRatedGame(12, null, now), true);

const since = ratingLeaderboardActivitySince(now);
assert.equal(since.toISOString(), '2026-05-22T00:00:00.000Z');

const recentWhere = recentRatedParticipantWhere('PADEL', since);
assert.equal(recentWhere.status, 'PLAYING');
assert.equal(recentWhere.game.sport, 'PADEL');
assert.equal(recentWhere.game.resultsStatus, 'FINAL');
assert.equal(recentWhere.game.affectsRating, true);
assert.equal(recentWhere.game.startTime.gte.toISOString(), since.toISOString());
assert.equal('userId' in recentWhere, false);
assert.equal('id' in recentWhere.game, false);

const scopedWhere = recentRatedParticipantWhere('PADEL', since, {
  userIds: ['qual-a', 'stale-star'],
  excludeGameId: 'game-1',
});
assert.deepEqual(scopedWhere.userId, { in: ['qual-a', 'stale-star'] });
assert.deepEqual(scopedWhere.game.id, { not: 'game-1' });

const recentIds = selectRecentRatedUserIds(
  ['qual-a', 'stale-star'],
  [{ userId: 'qual-a' }, { userId: 'stranger' }, { userId: 'stale-star' }],
);
assert.deepEqual([...recentIds].sort(), ['qual-a', 'stale-star']);
assert.equal(selectRecentRatedUserIds([], [{ userId: 'qual-a' }]).size, 0);
assert.equal(selectRecentRatedUserIds(['qual-a'], [{ userId: 'stranger' }]).size, 0);

type Entry = {
  id: string;
  level: number;
  reliability: number;
  gamesWon: number;
  gamesPlayed: number;
  inactive: boolean;
};

function entry(partial: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    level: 3,
    reliability: 50,
    gamesWon: 2,
    gamesPlayed: 6,
    inactive: false,
    ...partial,
  };
}

const staleStar = entry({
  id: 'stale-star',
  level: 6,
  reliability: 90,
  gamesWon: 40,
  gamesPlayed: 40,
  inactive: true,
});
const fewGames = entry({
  id: 'few-games',
  level: 5.5,
  reliability: 80,
  gamesWon: 4,
  gamesPlayed: 4,
  inactive: true,
});
const qualifierB = entry({
  id: 'qual-b',
  level: 4.2,
  reliability: 60,
  gamesWon: 8,
  gamesPlayed: 12,
  inactive: false,
});
const qualifierA = entry({
  id: 'qual-a',
  level: 4.5,
  reliability: 55,
  gamesWon: 6,
  gamesPlayed: 10,
  inactive: false,
});
const includedLowGames = entry({
  id: 'played-once',
  level: 2,
  reliability: 10,
  gamesWon: 0,
  gamesPlayed: 1,
  inactive: true,
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
assert.equal(ordered.find((user) => user.id === 'played-once')?.inactive, true);
assert.equal(ordered[0]?.inactive, false);
assert.equal(ordered[ordered.length - 1]?.inactive, true);

const qualifierIds = ordered.filter((user) => !user.inactive).map((user) => user.id);
assert.deepEqual(qualifierIds, ['qual-a', 'qual-b']);
assert.equal(qualifierIds.indexOf('stale-star'), -1);

const rankById = new Map(qualifierIds.map((id, index) => [id, index + 1]));
assert.equal(rankById.get('qual-a'), 1);
assert.equal(rankById.get('qual-b'), 2);
assert.equal(rankById.has('stale-star'), false);
assert.equal(rankById.has('few-games'), false);
assert.equal(rankById.has('played-once'), false);

const tied = orderRatingLeaderboard([
  entry({ id: 'tie-b', level: 4, reliability: 50, gamesWon: 7, inactive: false }),
  entry({ id: 'tie-a', level: 4, reliability: 50, gamesWon: 7, inactive: false }),
  entry({ id: 'below', level: 6, inactive: true, gamesPlayed: 2 }),
]);
assert.deepEqual(
  tied.map((user) => user.id),
  ['tie-a', 'tie-b', 'below'],
);
assert.equal(tied.filter((user) => !user.inactive).every((user) => user.id.startsWith('tie-')), true);

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
assert.equal(rankingServiceSrc.includes('qualifyAndRankRatingLeaderboard'), true);
assert.equal(rankingServiceSrc.includes('orderRatingLeaderboard'), true);
assert.equal(rankingServiceSrc.includes('!user.inactive'), true);
assert.equal(rankingServiceSrc.includes('getUserIdsWithRatedGameSince'), false);
assert.equal(rankingServiceSrc.includes('qualifiesForRatingRank'), false);
assert.equal(rankingServiceSrc.includes('recentRatedParticipantWhere'), false);

const cityStart = rankingServiceSrc.indexOf('static async getCityLeaderboardRanks');
const cityEnd = rankingServiceSrc.indexOf('static async getGamesInLast30Days', cityStart);
assert.ok(cityStart > 0 && cityEnd > cityStart);
const cityRanksFn = rankingServiceSrc.slice(cityStart, cityEnd);
assert.equal(cityRanksFn.includes('qualifyAndRankRatingLeaderboard'), false);
assert.equal(cityRanksFn.includes('orderPlayedRatingLeaderboard'), true);

const inactiveServiceSrc = readFileSync(join(rankingDir, 'sportProfileInactive.service.ts'), 'utf8');
assert.equal(inactiveServiceSrc.includes('recentRatedParticipantWhere'), true);
assert.equal(inactiveServiceSrc.includes('selectRecentRatedUserIds'), true);
assert.equal(inactiveServiceSrc.includes('refreshAgedSportProfileInactive'), true);
assert.equal(inactiveServiceSrc.includes('userIds: chunk'), true);
assert.equal(inactiveServiceSrc.includes('updateMany'), true);
assert.equal(inactiveServiceSrc.includes('gamesPlayed < RATING_LEADERBOARD_MIN_GAMES'), true);

const outcomesSrc = readFileSync(join(rankingDir, '../results/outcomes.service.ts'), 'utf8');
const applyStart = outcomesSrc.indexOf('export async function applyGameOutcomes');
assert.ok(applyStart > 0);
const applyFn = outcomesSrc.slice(applyStart);
assert.equal(applyFn.includes('ratingInactiveForRatedGame'), false);
assert.equal(applyFn.includes('refreshSportProfilesInactive'), true);
const applyUpdateIdx = applyFn.indexOf('await tx.game.update');
const applyRefreshIdx = applyFn.indexOf('refreshSportProfilesInactive');
assert.ok(applyUpdateIdx > 0 && applyRefreshIdx > applyUpdateIdx);
assert.equal(outcomesSrc.includes('excludeGameId: gameId'), true);

const recomputeSrc = readFileSync(join(rankingDir, '../user/userGameStatsRecompute.service.ts'), 'utf8');
assert.equal(recomputeSrc.includes('refreshSportProfilesInactive'), true);

const padelUpsertSrc = readFileSync(join(rankingDir, '../user/userSportProfile.service.ts'), 'utf8');
assert.equal(padelUpsertSrc.includes('refreshSportProfilesInactive'), true);
assert.equal(
  padelUpsertSrc.includes("typeof profile.inactive === 'boolean' ? profile.inactive : true"),
  true,
);

const reconcileSrc = readFileSync(
  join(rankingDir, '../../../scripts/reconcileSportProfileGameStats.ts'),
  'utf8',
);
assert.equal(reconcileSrc.includes('refreshSportProfilesInactive'), true);

const migrationSrc = readFileSync(
  join(rankingDir, '../../../prisma/migrations/20260823090000_add_sport_profile_inactive/migration.sql'),
  'utf8',
);
assert.equal(migrationSrc.includes('GameParticipant'), true);
assert.equal(migrationSrc.includes('affectsRating'), true);
assert.equal(migrationSrc.includes('lastRatingActivityAt'), false);
assert.equal(migrationSrc.includes('UserSportProfile_active_sport_idx'), true);

const schedulerSrc = readFileSync(join(rankingDir, '../ratingInactiveScheduler.service.ts'), 'utf8');
assert.equal(schedulerSrc.includes('refreshAgedSportProfileInactive'), true);
assert.equal(schedulerSrc.includes('20 4 * * *'), true);
const schedulerStart = schedulerSrc.slice(
  schedulerSrc.indexOf('start()'),
  schedulerSrc.indexOf('async run()'),
);
assert.equal([...schedulerStart.matchAll(/void this\.run\(\)/g)].length, 2);

const serverSrc = readFileSync(join(rankingDir, '../../server.ts'), 'utf8');
assert.equal(serverSrc.includes('RatingInactiveScheduler'), true);

const controllerSrc = readFileSync(join(rankingDir, '../../controllers/ranking.controller.ts'), 'utf8');
const gamesBranch = controllerSrc.slice(controllerSrc.indexOf('if (isGames)'));
const gamesEnd = gamesBranch.indexOf('} else if (usePerSportLevel');
assert.ok(gamesEnd > 0);
const gamesBlock = gamesBranch.slice(0, gamesEnd);
assert.equal(gamesBlock.includes('qualifyAndRankRatingLeaderboard'), false);
assert.equal(gamesBlock.includes('inactive: snapshot.inactive'), false);
assert.equal(controllerSrc.includes('qualifyAndRankRatingLeaderboard'), true);
assert.equal(controllerSrc.includes('inactive: snapshot.inactive'), true);
assert.equal(controllerSrc.includes('inactive: snap.inactive'), true);

console.log('ratingLeaderboardQualify: ok');
