/**
 * The results payload is a whitelist, and stays one.
 *
 * `GET /api/results/game/:gameId` is served to spectators holding a signed live
 * token — people with no account at all — so the two things this pins are:
 *
 *  1. the Prisma shape is a `select`, never an `include` (an `include` loads
 *     *every* `Game` scalar, `paymentHint` among them);
 *  2. the forbidden lists are actually enforced by the contract helper.
 *
 * Pure: no database, no `.env`.
 * Run: `ts-node --transpile-only src/services/results/gameResults.projection.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  RESULTS_FORBIDDEN_GAME_KEYS,
  RESULTS_FORBIDDEN_USER_KEYS,
  RESULTS_USER_SELECT,
  collectGameResultsContractIssues,
  getGameResultsSelect,
} from './gameResults.projection';

/* ------------------------------------------------------------------ */
/* The select carries nothing it should not                            */
/* ------------------------------------------------------------------ */

const select = getGameResultsSelect() as Record<string, unknown>;

for (const key of RESULTS_FORBIDDEN_GAME_KEYS) {
  assert.equal(
    key in select,
    false,
    `the results select must not ask for Game.${key}`,
  );
}
assert.equal(select.id, true, 'the scoreboard still needs the game id');
assert.equal(select.sport, true, 'the sport drives the per-sport user projection');
assert.equal(
  select.scoringPreset,
  true,
  'the spectator board derives its whole rulebook from the format block',
);
assert.ok(select.rounds, 'rounds are the payload');
assert.ok(select.outcomes, 'standings are part of the payload');

const userSelect = RESULTS_USER_SELECT as unknown as Record<string, unknown>;
for (const key of RESULTS_FORBIDDEN_USER_KEYS) {
  assert.equal(
    key in userSelect,
    false,
    `the results user select must not ask for User.${key}`,
  );
}
assert.equal(userSelect.id, true);
assert.equal(userSelect.firstName, true);
assert.ok(userSelect.sportProfiles, 'the per-sport level projection needs the profiles');

/* ------------------------------------------------------------------ */
/* The contract helper catches a regression                            */
/* ------------------------------------------------------------------ */

const clean = {
  id: 'g1',
  sport: 'PADEL',
  rounds: [
    {
      id: 'r1',
      matches: [
        {
          id: 'm1',
          teams: [{ id: 't1', players: [{ user: { id: 'u1', firstName: 'A' } }] }],
        },
      ],
      outcomes: [{ id: 'ro1', user: { id: 'u1', firstName: 'A' } }],
    },
  ],
  outcomes: [{ id: 'o1', user: { id: 'u1', firstName: 'A' } }],
};
assert.deepEqual(collectGameResultsContractIssues(clean), []);

assert.deepEqual(
  collectGameResultsContractIssues({ ...clean, paymentHint: 'Revolut @x' }).map((i) => i.path),
  ['paymentHint'],
  'a leaked payment handle is reported',
);

const leakedBio = JSON.parse(JSON.stringify(clean)) as typeof clean & {
  rounds: { matches: { teams: { players: { user: Record<string, unknown> }[] }[] }[] }[];
};
leakedBio.rounds[0].matches[0].teams[0].players[0].user.bio = 'private';
assert.deepEqual(
  collectGameResultsContractIssues(leakedBio).map((i) => i.path),
  ['rounds[0].matches[0].teams[0].players[0].user.bio'],
);

const leakedAvailability = JSON.parse(JSON.stringify(clean)) as typeof clean & {
  outcomes: { user: Record<string, unknown> }[];
};
leakedAvailability.outcomes[0].user.weeklyAvailability = { mon: [] };
assert.deepEqual(
  collectGameResultsContractIssues(leakedAvailability).map((i) => i.path),
  ['outcomes[0].user.weeklyAvailability'],
);

/* ------------------------------------------------------------------ */
/* Source scan — the shape must not drift back to `include`            */
/* ------------------------------------------------------------------ */

const serviceSource = readFileSync(
  path.join(__dirname, '..', 'results.service.ts'),
  'utf8',
);
const getGameResultsBody = serviceSource.slice(
  serviceSource.indexOf('export async function getGameResults('),
  serviceSource.indexOf('export async function getRoundResults('),
);
assert.ok(getGameResultsBody.length > 0, 'getGameResults must still exist');
assert.equal(
  getGameResultsBody.includes('include:'),
  false,
  'getGameResults must project with an explicit select, never an include',
);
assert.ok(
  getGameResultsBody.includes('getGameResultsSelect()'),
  'getGameResults must use the shared whitelist',
);

const controllerSource = readFileSync(
  path.join(__dirname, '..', '..', 'controllers', 'results.controller.ts'),
  'utf8',
);
assert.ok(
  controllerSource.includes('await assertCanReadGameResults(gameId, req.userId ?? null)'),
  'the results read must be authorized before any payload is built',
);
assert.ok(
  controllerSource.includes('await assertSpectatorGameStillWatchable(gameId)'),
  'spectator redemption must re-apply the live gate, not just verify the signature',
);

/*
 * The three outcome-explanation reads sit on the same `optionalAuth` router and
 * expose the same private game: a player's level/reliability internals and a
 * match breakdown with co-player names. They were the one results sibling the
 * hardening pass missed, so each handler body is checked for the gate.
 */
for (const handler of [
  'getOutcomeExplanation',
  'getOutcomeRatingExplanationLlm',
  'getOutcomeRatingExplanationTranslation',
] as const) {
  const start = controllerSource.indexOf(`export const ${handler} = asyncHandler(`);
  assert.ok(start >= 0, `${handler} must still exist`);
  const body = controllerSource.slice(start, start + 700);
  assert.ok(
    body.includes('await assertCanReadGameResults(gameId, req.userId ?? null)'),
    `${handler} must authorize the read before it answers — a private game is 404, not a payload`,
  );
}

console.log('gameResults.projection.test.ts: ok');
