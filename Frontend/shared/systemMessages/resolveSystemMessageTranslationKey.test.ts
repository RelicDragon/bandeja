import { describe, expect, it } from 'vitest';
import { resolveSystemMessageTranslationKey } from './resolveSystemMessageTranslationKey';

describe('resolveSystemMessageTranslationKey', () => {
  it('uses base key for regular games', () => {
    expect(resolveSystemMessageTranslationKey('USER_JOINED_GAME')).toBe(
      'chat.systemMessages.USER_JOINED_GAME',
    );
    expect(resolveSystemMessageTranslationKey('USER_JOINED_GAME', 'GAME')).toBe(
      'chat.systemMessages.USER_JOINED_GAME',
    );
  });

  it('uses entity-specific key for bar games', () => {
    expect(resolveSystemMessageTranslationKey('USER_JOINED_GAME', 'BAR')).toBe(
      'chat.systemMessages.BAR.USER_JOINED_GAME',
    );
  });
});
