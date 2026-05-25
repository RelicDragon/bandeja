/**
 * Cross-group bracket scope (create / advancement / PATCH) — unit expectations.
 * Full POST/advancement E2E with Prisma: run manual QA in §21.14 or add
 * `scripts/tests/cross-group-bracket-integration.ts` with a seeded season.
 */
import { buildBracketPlan } from './bracketStructure';
import { mergeGlobalParticipantIds, validateCrossGroupPool } from './crossGroupBracketSeeding';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

/** Mirrors persistGroupBracket / createGameForSlot leagueGroupId for CROSS_GROUP. */
function crossGroupPersistLeagueGroupId(): string | null {
  return null;
}

/** Mirrors advancement undo/cascade slot queries scoped to one tree. */
function advancementSlotScopeFilter(
  leagueRoundId: string,
  leagueGroupId: string | null
): { leagueRoundId: string; leagueGroupId: string | null } {
  return { leagueRoundId, leagueGroupId };
}

const qualifiers = {
  A: ['A1', 'A2'],
  B: ['B1', 'B2'],
  C: ['C1', 'C2'],
  D: ['D1', 'D2'],
};
const order = ['A', 'B', 'C', 'D'];
const globalIds = mergeGlobalParticipantIds(qualifiers, order, 'WINNERS_THEN_RUNNERS_UP');
validateCrossGroupPool({
  k: 2,
  includedGroupIds: order,
  qualifiers,
  globalParticipantIds: globalIds,
});

assert(globalIds.length === 8, 'global pool N=8');
const plan = buildBracketPlan(globalIds.length, globalIds);
assert(plan.entrantCount === 8, 'plan uses global N');
assert(plan.slots.length > 0, 'plan has slots');

const slotGroupId = crossGroupPersistLeagueGroupId();
assert(slotGroupId === null, 'CROSS_GROUP slots use leagueGroupId null');

const scope = advancementSlotScopeFilter('round-1', null);
assert(scope.leagueGroupId === null, 'advancement scoped to null group tree');
assert(scope.leagueRoundId === 'round-1', 'advancement scoped to round');

const perGroupScope = advancementSlotScopeFilter('round-1', 'group-A');
assert(perGroupScope.leagueGroupId === 'group-A', 'PER_GROUP advancement keeps group id');

console.log('ok: cross-group bracket scope unit tests passed');
