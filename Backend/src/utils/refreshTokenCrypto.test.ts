import assert from 'node:assert/strict';
import {
  decryptRefreshReplayToken,
  encryptRefreshReplayToken,
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from './refreshTokenCrypto';

const secret = 'test-refresh-replay-secret-with-at-least-32-characters';
const token = generateOpaqueRefreshToken();
const encrypted = encryptRefreshReplayToken(token, secret);

assert.notEqual(encrypted, token);
assert.equal(decryptRefreshReplayToken(encrypted, secret), token);
assert.equal(hashRefreshToken(token).length, 64);
assert.throws(() => decryptRefreshReplayToken(encrypted, `${secret}-wrong`));
assert.throws(() => decryptRefreshReplayToken('not-a-valid-payload', secret));

console.log('refreshTokenCrypto.test.ts: ok');
