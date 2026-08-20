import assert from 'node:assert/strict';
import {
  evaluateGenderForGame,
  GENDER_INCOMPATIBLE_CODE,
  GENDER_UNSET_CODE,
  GENDER_UNSET_OTHER_MESSAGE,
  isGenderedEvent,
} from './genderGameEligibility';

assert.equal(isGenderedEvent(null), false);
assert.equal(isGenderedEvent({ genderTeams: 'ANY' }), false);
assert.equal(isGenderedEvent({ genderTeams: 'MEN', entityType: 'BAR' }), false);
assert.equal(isGenderedEvent({ genderTeams: 'MEN' }), true);
assert.equal(isGenderedEvent({ genderTeams: 'WOMEN' }), true);
assert.equal(isGenderedEvent({ genderTeams: 'MIX_PAIRS' }), true);
assert.equal(isGenderedEvent({}), false);

const unset = { gender: 'PREFER_NOT_TO_SAY' as const, genderIsSet: false };
const male = { gender: 'MALE' as const, genderIsSet: true };
const female = { gender: 'FEMALE' as const, genderIsSet: true };
const preferNot = { gender: 'PREFER_NOT_TO_SAY' as const, genderIsSet: true };

assert.deepEqual(evaluateGenderForGame({ genderTeams: 'ANY' }, unset), { ok: true });
assert.deepEqual(evaluateGenderForGame({ genderTeams: 'MEN' }, male), { ok: true });
assert.deepEqual(evaluateGenderForGame({ genderTeams: 'WOMEN' }, female), { ok: true });
assert.deepEqual(evaluateGenderForGame({ genderTeams: 'MIX_PAIRS' }, male), { ok: true });
assert.deepEqual(evaluateGenderForGame({ genderTeams: 'MIX_PAIRS' }, female), { ok: true });

const unsetSelf = evaluateGenderForGame({ genderTeams: 'MEN' }, unset);
assert.equal(unsetSelf.ok, false);
if (!unsetSelf.ok) {
  assert.equal(unsetSelf.code, GENDER_UNSET_CODE);
  assert.equal(unsetSelf.message, GENDER_UNSET_CODE);
}

const unsetOther = evaluateGenderForGame({ genderTeams: 'MEN' }, unset, { targetIsOtherUser: true });
assert.equal(unsetOther.ok, false);
if (!unsetOther.ok) {
  assert.equal(unsetOther.code, GENDER_UNSET_CODE);
  assert.equal(unsetOther.message, GENDER_UNSET_OTHER_MESSAGE);
}

const maleOnWomen = evaluateGenderForGame({ genderTeams: 'WOMEN' }, male);
assert.equal(maleOnWomen.ok, false);
if (!maleOnWomen.ok) {
  assert.equal(maleOnWomen.code, GENDER_INCOMPATIBLE_CODE);
  assert.equal(maleOnWomen.message, 'errors.games.genderIncompatibleWomen');
}

const femaleOnMen = evaluateGenderForGame({ genderTeams: 'MEN' }, female);
assert.equal(femaleOnMen.ok, false);
if (!femaleOnMen.ok) {
  assert.equal(femaleOnMen.code, GENDER_INCOMPATIBLE_CODE);
  assert.equal(femaleOnMen.message, 'errors.games.genderIncompatibleMen');
}

const preferOnMix = evaluateGenderForGame({ genderTeams: 'MIX_PAIRS' }, preferNot);
assert.equal(preferOnMix.ok, false);
if (!preferOnMix.ok) {
  assert.equal(preferOnMix.code, GENDER_INCOMPATIBLE_CODE);
  assert.equal(preferOnMix.message, 'errors.games.genderIncompatibleMix');
}

const unsetMaleValue = evaluateGenderForGame(
  { genderTeams: 'MEN' },
  { gender: 'MALE', genderIsSet: false },
);
assert.equal(unsetMaleValue.ok, false);
if (!unsetMaleValue.ok) {
  assert.equal(unsetMaleValue.code, GENDER_UNSET_CODE);
}

console.log('genderGameEligibility tests passed');
