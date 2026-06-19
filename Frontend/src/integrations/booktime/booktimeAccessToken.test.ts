import { describe, expect, it } from 'vitest';
import {
  booktimeAccessTokenExpiresAtIso,
  isBooktimeAccessTokenExpired,
} from './booktimeAccessToken';

function jwtWithExp(expSec: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp: expSec }));
  return `${header}.${payload}.sig`;
}

describe('booktimeAccessToken', () => {
  it('detects expired access tokens with leeway', () => {
    const expired = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
    expect(isBooktimeAccessTokenExpired(expired, 0)).toBe(true);
  });

  it('derives expiresAt ISO from JWT exp', () => {
    const expSec = 1_700_000_000;
    expect(booktimeAccessTokenExpiresAtIso(jwtWithExp(expSec))).toBe(
      new Date(expSec * 1000).toISOString(),
    );
  });
});
