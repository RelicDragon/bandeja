import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  parseNamedCookieValues,
  readRefreshTokenCandidatesFromRequest,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
  shouldUseCookieForRefreshResponse,
} from './refreshWebCookie';
import { config } from '../config/env';

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

const cookieName = config.refreshCookieName;
assert.deepEqual(parseNamedCookieValues(`${cookieName}=dead; ${cookieName}=live`, cookieName), [
  'dead',
  'live',
]);

const dualWebCookies = {
  headers: {
    'x-client-platform': 'web',
    cookie: `${cookieName}=dead; ${cookieName}=live`,
  },
  body: { refreshToken: 'stale-ls' },
} as unknown as Request;
assert.deepEqual(readRefreshTokenCandidatesFromRequest(dualWebCookies), ['dead', 'live']);
assert.equal(readRefreshTokenFromRequest(dualWebCookies), 'live');

const nativeWithBody = {
  headers: {
    'x-client-platform': 'ios',
    cookie: `${cookieName}=web-cookie`,
  },
  body: { refreshToken: 'native-refresh' },
} as unknown as Request;
assert.deepEqual(readRefreshTokenCandidatesFromRequest(nativeWithBody), [
  'native-refresh',
  'web-cookie',
]);

const setCookies: string[] = [];
const setRes = {
  append: (_name: string, value: string) => {
    setCookies.push(value);
  },
} as unknown as Response;
setRefreshTokenCookie(setRes, 'live-refresh-token');
assert.equal(setCookies.length, 1);
assert.equal(setCookies.some((value) => value.includes('Max-Age=0')), false);
assert.equal(setCookies[0]?.includes('live-refresh-token'), true);

console.log('refreshWebCookie.test.ts: ok');
