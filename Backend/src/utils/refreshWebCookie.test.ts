import assert from 'node:assert/strict';
import type { Request } from 'express';
import { shouldUseCookieForRefreshResponse } from './refreshWebCookie';

function request(platform: string, refreshToken?: string): Request {
  return {
    headers: { 'x-client-platform': platform },
    body: refreshToken ? { refreshToken } : {},
  } as unknown as Request;
}

assert.equal(shouldUseCookieForRefreshResponse(request('web')), true);
assert.equal(shouldUseCookieForRefreshResponse(request('ios')), true);
assert.equal(shouldUseCookieForRefreshResponse(request('android')), true);
assert.equal(shouldUseCookieForRefreshResponse(request('ios', 'native-refresh')), false);
assert.equal(shouldUseCookieForRefreshResponse(request('android', 'native-refresh')), false);

console.log('refreshWebCookie.test.ts: ok');
