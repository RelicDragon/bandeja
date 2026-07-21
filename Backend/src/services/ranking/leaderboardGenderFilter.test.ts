import assert from 'node:assert/strict';
import { ApiError } from '../../utils/ApiError';
import { resolveLeaderboardGenderFilter } from './leaderboardGenderFilter';

assert.equal(resolveLeaderboardGenderFilter(undefined), null);
assert.equal(resolveLeaderboardGenderFilter(null), null);
assert.equal(resolveLeaderboardGenderFilter(''), null);
assert.equal(resolveLeaderboardGenderFilter('all'), null);
assert.equal(resolveLeaderboardGenderFilter('ALL'), null);
assert.equal(resolveLeaderboardGenderFilter('men'), 'MALE');
assert.equal(resolveLeaderboardGenderFilter('MALE'), 'MALE');
assert.equal(resolveLeaderboardGenderFilter('women'), 'FEMALE');
assert.equal(resolveLeaderboardGenderFilter('FEMALE'), 'FEMALE');
assert.equal(resolveLeaderboardGenderFilter(['men', 'women']), 'MALE');
assert.equal(resolveLeaderboardGenderFilter(['all']), null);

assert.throws(
  () => resolveLeaderboardGenderFilter('other'),
  (err: unknown) => err instanceof ApiError && err.statusCode === 400,
);
assert.throws(
  () => resolveLeaderboardGenderFilter(['nope']),
  (err: unknown) => err instanceof ApiError && err.statusCode === 400,
);

console.log('leaderboardGenderFilter: ok');
