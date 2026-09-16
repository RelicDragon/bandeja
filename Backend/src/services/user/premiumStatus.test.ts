import assert from 'node:assert/strict';
import { ApiError } from '../../utils/ApiError';
import { validateShowPremiumStatusUpdate } from './premiumStatus';
import { USER_SELECT_FIELDS, PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { FIND_CARD_USER_SELECT } from '../game/availableGamesCard.projection';

for (const premium of [true, false]) {
  assert.equal(validateShowPremiumStatusUpdate(undefined, premium), undefined);
  for (const value of [null, '', 'true', 'false', 0, 1, {}, []]) {
    assert.throws(() => validateShowPremiumStatusUpdate(value, premium),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400);
  }
}
for (const value of [true, false]) {
  assert.equal(validateShowPremiumStatusUpdate(value, true), value);
  assert.throws(() => validateShowPremiumStatusUpdate(value, false),
    (error: unknown) => error instanceof ApiError && error.statusCode === 403);
}
for (const projection of [USER_SELECT_FIELDS, PROFILE_SELECT_FIELDS, FIND_CARD_USER_SELECT]) {
  assert.equal(projection.showPremiumStatus, true, 'Public and own profile projections must carry the opt-out');
}
console.log('Premium status visibility validation and projections passed');
