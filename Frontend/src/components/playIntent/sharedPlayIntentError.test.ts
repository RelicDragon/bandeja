import { describe, expect, it } from 'vitest';
import { sharedPlayIntentErrorTranslationKey } from './sharedPlayIntentError';

describe('sharedPlayIntentErrorTranslationKey', () => {
  it('prefers a typed API code', () => {
    expect(
      sharedPlayIntentErrorTranslationKey({
        response: {
          data: {
            code: 'playIntent.unavailable',
            message: 'Fallback message',
          },
        },
      }),
    ).toBe('playIntent.unavailable');
  });

  it('falls back to a string API message', () => {
    expect(
      sharedPlayIntentErrorTranslationKey({
        response: { data: { code: 409, message: 'playIntent.expired' } },
      }),
    ).toBe('playIntent.expired');
  });

  it('rejects malformed and non-API errors', () => {
    expect(sharedPlayIntentErrorTranslationKey(new Error('offline'))).toBe(
      undefined,
    );
    expect(
      sharedPlayIntentErrorTranslationKey({
        response: { data: { code: { nested: true } } },
      }),
    ).toBe(undefined);
  });
});
