import assert from 'node:assert/strict';
import { decryptToken, encryptToken, TokenDecryptError, tryDecryptToken } from './tokenEncryption';

function withKeys(keys: { booktime?: string; jwt?: string }, fn: () => void) {
  const prevBooktime = process.env.BOOKTIME_TOKEN_ENCRYPTION_KEY;
  const prevJwt = process.env.JWT_SECRET;
  try {
    if (keys.booktime === undefined) delete process.env.BOOKTIME_TOKEN_ENCRYPTION_KEY;
    else process.env.BOOKTIME_TOKEN_ENCRYPTION_KEY = keys.booktime;
    if (keys.jwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = keys.jwt;
    fn();
  } finally {
    if (prevBooktime === undefined) delete process.env.BOOKTIME_TOKEN_ENCRYPTION_KEY;
    else process.env.BOOKTIME_TOKEN_ENCRYPTION_KEY = prevBooktime;
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  }
}

withKeys({ jwt: 'key-a' }, () => {
  assert.equal(decryptToken(encryptToken('secret-token')), 'secret-token');
});

let encodedWithA = '';
withKeys({ jwt: 'key-a' }, () => {
  encodedWithA = encryptToken('secret-token');
});

withKeys({ jwt: 'key-b' }, () => {
  assert.throws(() => decryptToken(encodedWithA), (err: unknown) => err instanceof TokenDecryptError);
  assert.equal(tryDecryptToken(encodedWithA), null);
});

withKeys({ jwt: 'key-a', booktime: 'dedicated-key' }, () => {
  assert.equal(tryDecryptToken(encodedWithA), null);
});

withKeys({ jwt: 'key-a' }, () => {
  assert.equal(tryDecryptToken('not-valid'), null);
  assert.throws(() => decryptToken('not-valid'), (err: unknown) => err instanceof TokenDecryptError);
});

withKeys({}, () => {
  assert.throws(() => encryptToken('x'), (err: unknown) => err instanceof Error && !(err instanceof TokenDecryptError));
  assert.throws(() => decryptToken('aaaa'), (err: unknown) => err instanceof Error && !(err instanceof TokenDecryptError));
});

console.log('tokenEncryption.test.ts: ok');
