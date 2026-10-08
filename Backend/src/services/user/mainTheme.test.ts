import assert from 'node:assert/strict';
import { MainTheme } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { validateMainThemeUpdate } from './mainTheme';

for (const premium of [true, false]) {
  assert.equal(validateMainThemeUpdate(undefined, premium), undefined);
  for (const value of [null, '', 'dark', 'PREMIUM', 'Spring', true, 1, {}, ['premium']]) {
    assert.throws(() => validateMainThemeUpdate(value, premium),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400);
  }
}
const themes = Object.values(MainTheme);
for (const expected of ['classic', 'premium', 'spring', 'cyberpunk', 'steampunk', 'woodstone', 'ocean', 'nordic']) {
  assert.ok((themes as string[]).includes(expected), `MainTheme must include ${expected}`);
}
for (const value of themes) {
  assert.equal(validateMainThemeUpdate(value, true), value);
  assert.throws(() => validateMainThemeUpdate(value, false),
    (error: unknown) => error instanceof ApiError && error.statusCode === 403);
}
assert.throws(() => validateMainThemeUpdate('bogus', true),
  (error: unknown) => error instanceof ApiError && themes.every((t) => error.message.includes(t)));
console.log('Main theme validation passed');
