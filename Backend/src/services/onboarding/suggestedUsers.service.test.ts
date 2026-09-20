/**
 * PRD 350 — pure tests for the "People to follow" ranking helpers.
 * The database-backed half (city / sport / block filtering) lives in
 * `suggestedUsers.integration.test.ts`.
 */
import assert from 'node:assert/strict';
import {
  SUGGESTED_USERS_DEFAULT_LIMIT,
  SUGGESTED_USERS_MAX_LIMIT,
  SUGGESTED_USERS_RECENT_DAYS,
  SUGGESTED_USERS_WINDOW_DAYS,
  clampSuggestedLimit,
  rankSuggestedCandidates,
  windowStart,
} from './suggestedUsers.service';

// ---------------------------------------------------------------------------
// limits
// ---------------------------------------------------------------------------

assert.equal(SUGGESTED_USERS_DEFAULT_LIMIT, 8, 'the PRD asks for 6–8 rows');
assert.equal(SUGGESTED_USERS_WINDOW_DAYS, 60);
assert.equal(SUGGESTED_USERS_RECENT_DAYS, 30);

assert.equal(clampSuggestedLimit(undefined), SUGGESTED_USERS_DEFAULT_LIMIT);
assert.equal(clampSuggestedLimit(''), SUGGESTED_USERS_DEFAULT_LIMIT);
assert.equal(clampSuggestedLimit('6'), 6);
assert.equal(clampSuggestedLimit(6), 6);
assert.equal(clampSuggestedLimit('6.9'), 6, 'truncated, never rounded up');
assert.equal(clampSuggestedLimit('0'), SUGGESTED_USERS_DEFAULT_LIMIT);
assert.equal(clampSuggestedLimit('-3'), SUGGESTED_USERS_DEFAULT_LIMIT);
assert.equal(clampSuggestedLimit('abc'), SUGGESTED_USERS_DEFAULT_LIMIT);
assert.equal(clampSuggestedLimit('1000'), SUGGESTED_USERS_MAX_LIMIT, 'hard ceiling');

// ---------------------------------------------------------------------------
// window maths
// ---------------------------------------------------------------------------

const now = new Date('2026-03-01T12:00:00.000Z');
assert.equal(windowStart(now, 60).toISOString(), '2025-12-31T12:00:00.000Z');
assert.equal(windowStart(now, 30).toISOString(), '2026-01-30T12:00:00.000Z');

// ---------------------------------------------------------------------------
// ranking
// ---------------------------------------------------------------------------

const candidates = [
  { userId: 'u-low', gamesInWindow: 1 },
  { userId: 'u-top', gamesInWindow: 12 },
  { userId: 'u-blocked', gamesInWindow: 30 },
  { userId: 'u-mid', gamesInWindow: 5 },
  { userId: 'viewer', gamesInWindow: 40 },
];

const ranked = rankSuggestedCandidates(candidates, {
  excludeUserIds: ['viewer', 'u-blocked'],
  limit: 10,
});
assert.deepEqual(
  ranked.map((row) => row.userId),
  ['u-top', 'u-mid', 'u-low'],
  'ordered by finished games desc, viewer and blocked users dropped',
);

// The input array is not mutated — the caller reuses it for the fallback pass.
assert.equal(candidates[0].userId, 'u-low');

// Ties break on id so two identical calls return the same order.
const tied = rankSuggestedCandidates(
  [
    { userId: 'b', gamesInWindow: 3 },
    { userId: 'a', gamesInWindow: 3 },
    { userId: 'c', gamesInWindow: 3 },
  ],
  { excludeUserIds: [], limit: 10 },
);
assert.deepEqual(
  tied.map((row) => row.userId),
  ['a', 'b', 'c'],
);

assert.equal(
  rankSuggestedCandidates(candidates, { excludeUserIds: [], limit: 2 }).length,
  2,
  'cut to limit',
);
assert.deepEqual(rankSuggestedCandidates(candidates, { excludeUserIds: [], limit: 0 }), []);
assert.deepEqual(
  rankSuggestedCandidates([], { excludeUserIds: ['viewer'], limit: 8 }),
  [],
  'an empty city yields an empty list rather than throwing',
);

console.log('suggestedUsers.service.test.ts OK');
