import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { requireTrustedRefreshOrigin } from './refreshOrigin';

function run(input: { origin?: string; platform: string; refreshToken?: string }): unknown {
  let nextValue: unknown = Symbol('not-called');
  const req = {
    body: input.refreshToken ? { refreshToken: input.refreshToken } : {},
    headers: { 'x-client-platform': input.platform },
    get: (name: string) => (name === 'Origin' ? input.origin : undefined),
  } as unknown as Request;
  requireTrustedRefreshOrigin(req, {} as Response, ((value?: unknown) => {
    nextValue = value;
  }) as NextFunction);
  return nextValue;
}

assert.equal(run({ origin: 'https://bandeja.me', platform: 'web' }), undefined);
assert.equal((run({ origin: 'https://evil.example', platform: 'web' }) as { statusCode?: number }).statusCode, 403);
assert.equal((run({ platform: 'web' }) as { statusCode?: number }).statusCode, 403);
assert.equal(run({ platform: 'ios', refreshToken: 'native-token' }), undefined);
assert.equal(run({ platform: 'android', refreshToken: 'native-token' }), undefined);

{
  let nextValue: unknown = Symbol('not-called');
  const req = {
    body: {},
    headers: { 'x-client-platform': 'web' },
    get: (name: string) => (name === 'Sec-Fetch-Site' ? 'same-origin' : undefined),
  } as unknown as Request;
  requireTrustedRefreshOrigin(req, {} as Response, ((value?: unknown) => {
    nextValue = value;
  }) as NextFunction);
  assert.equal(nextValue, undefined);
}

console.log('refreshOrigin.test.ts: ok');
