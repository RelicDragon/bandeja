import assert from 'node:assert/strict';
import { PremiumNameStyle } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { validatePremiumNameStyleUpdate } from './premiumNameStyle';

for (const premium of [true, false]) {
  assert.equal(validatePremiumNameStyleUpdate(undefined, premium), undefined);
  for (const value of [null, '', 'GOLD', 'silver', true, 1, {}, ['gold']]) {
    assert.throws(() => validatePremiumNameStyleUpdate(value, premium),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400);
  }
}
const styles = Object.values(PremiumNameStyle);
assert.deepEqual([...styles].sort(), ['aurora', 'ember', 'frost', 'gold', 'holo', 'neon', 'platinum', 'rose']);
for (const value of styles) {
  assert.equal(validatePremiumNameStyleUpdate(value, true), value);
  assert.throws(() => validatePremiumNameStyleUpdate(value, false),
    (error: unknown) => error instanceof ApiError && error.statusCode === 403);
}
assert.throws(() => validatePremiumNameStyleUpdate('bogus', true),
  (error: unknown) => error instanceof ApiError && styles.every((s) => error.message.includes(s)));
console.log('Premium name style validation passed');
