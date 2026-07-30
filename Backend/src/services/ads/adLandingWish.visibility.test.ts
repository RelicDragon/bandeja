import assert from 'node:assert/strict';
import { isKnownAdLandingWishSmokeProbe } from './adLandingWish.visibility';

assert.equal(
  isKnownAdLandingWishSmokeProbe({ displayName: 'CI Check', message: 'post-deploy' }),
  true
);
assert.equal(
  isKnownAdLandingWishSmokeProbe({ displayName: 'Anon', message: 'no token' }),
  true
);
assert.equal(
  isKnownAdLandingWishSmokeProbe({
    displayName: 'A genuine friend',
    message: 'Happy birthday!',
  }),
  false
);
assert.equal(
  isKnownAdLandingWishSmokeProbe({
    displayName: 'CI Check',
    message: 'A real message with a coincidental name',
  }),
  false
);

console.log('adLandingWish.visibility: ok');
