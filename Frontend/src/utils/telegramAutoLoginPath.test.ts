import { describe, expect, it } from 'vitest';
import {
  isTelegramAutoLoginPath,
  shouldConsumePendingTelegramAuthPath,
} from './telegramAutoLoginPath';

describe('isTelegramAutoLoginPath', () => {
  it('matches telegram link keys', () => {
    expect(isTelegramAutoLoginPath('/login/550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('excludes phone and telegram tabs', () => {
    expect(isTelegramAutoLoginPath('/login/phone')).toBe(false);
    expect(isTelegramAutoLoginPath('/login/telegram')).toBe(false);
    expect(isTelegramAutoLoginPath('/login')).toBe(false);
  });
});

describe('shouldConsumePendingTelegramAuthPath', () => {
  const keyPath = '/login/550e8400-e29b-41d4-a716-446655440000';

  it('redirects from /login when a telegram key is pending', () => {
    expect(shouldConsumePendingTelegramAuthPath('/login', keyPath, false)).toBe(true);
  });

  it('redirects from / when a telegram key is pending', () => {
    expect(shouldConsumePendingTelegramAuthPath('/', keyPath, false)).toBe(true);
  });

  it('does not redirect when already on the key route', () => {
    expect(shouldConsumePendingTelegramAuthPath(keyPath, keyPath, false)).toBe(false);
  });

  it('does not redirect authenticated users', () => {
    expect(shouldConsumePendingTelegramAuthPath('/login', keyPath, true)).toBe(false);
  });
});
