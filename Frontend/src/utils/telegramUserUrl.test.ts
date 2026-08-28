import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTelegramUserOpenPlan, buildTelegramUserUrl } from './telegramUserUrl';

const isCapacitorMock = vi.fn(() => false);
vi.mock('./capacitor', () => ({
  isCapacitor: () => isCapacitorMock(),
}));

describe('buildTelegramUserUrl', () => {
  afterEach(() => {
    isCapacitorMock.mockReturnValue(false);
    vi.unstubAllGlobals();
  });

  it('prefers username t.me link when available', () => {
    expect(
      buildTelegramUserOpenPlan({ telegramUsername: '@player', telegramId: '64171282' })
    ).toEqual({ url: 'https://t.me/player', webFallback: null });
  });

  it('opens desktop app by id and keeps web fallback if Telegram is missing', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' });
    expect(buildTelegramUserOpenPlan({ telegramId: '64171282' })).toEqual({
      url: 'tg://user?id=64171282',
      webFallback: 'https://web.telegram.org/k/#64171282',
    });
    expect(buildTelegramUserUrl({ telegramId: '64171282' })).toBe('tg://user?id=64171282');
  });

  it('uses openmessage on mobile web when only id is known', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    expect(buildTelegramUserOpenPlan({ telegramId: '64171282' })).toEqual({
      url: 'tg://openmessage?user_id=64171282',
      webFallback: 'https://web.telegram.org/k/#64171282',
    });
  });

  it('uses openmessage in native app when only id is known', () => {
    isCapacitorMock.mockReturnValue(true);
    expect(buildTelegramUserOpenPlan({ telegramId: '64171282' })).toEqual({
      url: 'tg://openmessage?user_id=64171282',
      webFallback: 'https://web.telegram.org/k/#64171282',
    });
  });

  it('returns null when no telegram contact is available', () => {
    expect(buildTelegramUserOpenPlan({})).toBeNull();
  });
});
