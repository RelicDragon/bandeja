import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import { ratingInactiveKey } from './ratingLeaderboardQualify';
import {
  chunkList,
  nextSportProfileInactiveFlags,
  uniqueSportProfileKeys,
} from './sportProfileInactive.service';

assert.deepEqual(chunkList([], 400), []);
assert.deepEqual(chunkList(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
assert.deepEqual(chunkList(['a'], 400), [['a']]);

assert.deepEqual(
  uniqueSportProfileKeys([
    { userId: 'a', sport: Sport.PADEL },
    { userId: 'a', sport: Sport.PADEL },
    { userId: 'a', sport: Sport.TENNIS },
  ]),
  [
    { userId: 'a', sport: Sport.PADEL },
    { userId: 'a', sport: Sport.TENNIS },
  ],
);

const stale = {
  userId: 'stale-star',
  sport: Sport.PADEL,
  gamesPlayed: 40,
  inactive: false,
};
const few = {
  userId: 'few-games',
  sport: Sport.PADEL,
  gamesPlayed: 4,
  inactive: false,
};
const active = {
  userId: 'qual-a',
  sport: Sport.PADEL,
  gamesPlayed: 10,
  inactive: true,
};
const alreadyInactive = {
  userId: 'idle',
  sport: Sport.TENNIS,
  gamesPlayed: 12,
  inactive: true,
};

const recent = new Set([ratingInactiveKey('qual-a', Sport.PADEL)]);

const updates = nextSportProfileInactiveFlags([stale, few, active, alreadyInactive], recent);
assert.deepEqual(
  updates.sort((a, b) => a.userId.localeCompare(b.userId)),
  [
    { userId: 'few-games', sport: Sport.PADEL, inactive: true },
    { userId: 'qual-a', sport: Sport.PADEL, inactive: false },
    { userId: 'stale-star', sport: Sport.PADEL, inactive: true },
  ],
);

assert.deepEqual(
  nextSportProfileInactiveFlags(
    [{ userId: 'few-games', sport: Sport.PADEL, gamesPlayed: 4, inactive: false }],
    new Set(),
  ),
  [{ userId: 'few-games', sport: Sport.PADEL, inactive: true }],
);

assert.deepEqual(nextSportProfileInactiveFlags([], recent), []);

console.log('sportProfileInactive.service: ok');
