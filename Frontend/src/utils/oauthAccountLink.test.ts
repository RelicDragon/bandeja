import { describe, expect, it } from 'vitest';
import {
  getOAuthLinkMergeRequired,
  isOAuthLinkLoginResponse,
} from './oauthAccountLink';

describe('getOAuthLinkMergeRequired', () => {
  it('returns google when code and provider match', () => {
    const err = {
      response: {
        data: {
          code: 'auth.oauthLinkMergeRequired',
          message: 'auth.oauthLinkMergeRequired',
          provider: 'google',
        },
      },
    };
    expect(getOAuthLinkMergeRequired(err)).toBe('google');
  });

  it('returns apple when provider is apple', () => {
    const err = {
      response: {
        data: {
          code: 'auth.oauthLinkMergeRequired',
          provider: 'apple',
        },
      },
    };
    expect(getOAuthLinkMergeRequired(err)).toBe('apple');
  });

  it('returns null for unrelated errors', () => {
    expect(getOAuthLinkMergeRequired({ response: { data: { code: 'auth.other' } } })).toBeNull();
    expect(getOAuthLinkMergeRequired(null)).toBeNull();
  });
});

describe('isOAuthLinkLoginResponse', () => {
  it('is true when token is present', () => {
    expect(isOAuthLinkLoginResponse({ user: {} as never, token: 'abc' })).toBe(true);
  });

  it('is false when token is missing or empty', () => {
    expect(isOAuthLinkLoginResponse({ user: {} as never })).toBe(false);
    expect(isOAuthLinkLoginResponse({ user: {} as never, token: '' })).toBe(false);
  });
});
