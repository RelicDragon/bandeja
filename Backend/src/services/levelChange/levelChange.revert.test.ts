import assert from 'node:assert/strict';
import { LevelChangeEventType } from '@prisma/client';
import {
  eventTypesForRevertScope,
  isSocialLevelRevertEventType,
} from './revertScope';
import { shouldCreateGameLevelChangeEvent } from '../results/outcomeStatsSnapshot';

const outcomesTypes = eventTypesForRevertScope('outcomes');
assert.ok(outcomesTypes.includes(LevelChangeEventType.GAME));
assert.ok(outcomesTypes.includes(LevelChangeEventType.SET));
assert.ok(!outcomesTypes.includes(LevelChangeEventType.SOCIAL_BAR));

const socialTypes = eventTypesForRevertScope('social');
assert.deepEqual(socialTypes, [
  LevelChangeEventType.SOCIAL_PARTICIPANT,
  LevelChangeEventType.SOCIAL_BAR,
]);
for (const t of socialTypes) {
  assert.equal(isSocialLevelRevertEventType(t), true);
}

const allTypes = eventTypesForRevertScope('all');
assert.ok(allTypes.includes(LevelChangeEventType.SOCIAL_BAR));
assert.ok(allTypes.includes(LevelChangeEventType.GAME));
assert.equal(
  allTypes.filter(isSocialLevelRevertEventType).length,
  2,
  'all scope must include both social types for unified reset/delete semantics',
);

assert.equal(shouldCreateGameLevelChangeEvent(false, 0), true);
assert.equal(shouldCreateGameLevelChangeEvent(true, 0), false);

console.log('levelChange.revert.test.ts: ok');
