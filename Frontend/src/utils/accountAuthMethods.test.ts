import { describe, expect, it } from 'vitest';
import { canUnlinkAuthMethod, getLinkedAuthMethodCount } from './accountAuthMethods';

describe('account auth methods', () => {
  it('counts linked phone and social auth methods', () => {
    expect(getLinkedAuthMethodCount({ phone: '+1', telegramId: 'tg', googleId: 'g' })).toBe(3);
    expect(getLinkedAuthMethodCount({})).toBe(0);
    expect(getLinkedAuthMethodCount(null)).toBe(0);
  });

  it('allows unlinking a social method when another sign-in method remains', () => {
    expect(canUnlinkAuthMethod({ phone: '+1', telegramId: 'tg' }, 'telegram')).toBe(true);
    expect(canUnlinkAuthMethod({ telegramId: 'tg', googleId: 'g' }, 'telegram')).toBe(true);
    expect(canUnlinkAuthMethod({ appleSub: 'a', googleId: 'g' }, 'google')).toBe(true);
  });

  it('blocks unlinking the last sign-in method', () => {
    expect(canUnlinkAuthMethod({ telegramId: 'tg' }, 'telegram')).toBe(false);
    expect(canUnlinkAuthMethod({ googleId: 'g' }, 'google')).toBe(false);
    expect(canUnlinkAuthMethod({ appleSub: 'a' }, 'apple')).toBe(false);
  });

  it('does not allow unlinking a method that is not linked', () => {
    expect(canUnlinkAuthMethod({ telegramId: 'tg', googleId: 'g' }, 'apple')).toBe(false);
  });
});
