import assert from 'node:assert/strict';
import { ApiError } from '../../utils/ApiError';
import { validateMainThemeUpdate } from './mainTheme';

for (const premium of [true, false]) {
  assert.equal(validateMainThemeUpdate(undefined, premium), undefined);
  for (const value of [null, '', 'dark', 'PREMIUM', true, 1, {}, ['premium']]) {
    assert.throws(() => validateMainThemeUpdate(value, premium),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400);
  }
}
for (const value of ['classic', 'premium']) {
  assert.equal(validateMainThemeUpdate(value, true), value);
  assert.throws(() => validateMainThemeUpdate(value, false),
    (error: unknown) => error instanceof ApiError && error.statusCode === 403);
}
console.log('Main theme validation passed');
