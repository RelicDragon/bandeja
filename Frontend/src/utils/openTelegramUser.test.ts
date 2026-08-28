// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openTelegramUser, TELEGRAM_PROTOCOL_HANDOFF_MS } from './openTelegramUser';

const isCapacitorMock = vi.fn(() => false);
const openExternalUrl = vi.fn(async () => undefined);

vi.mock('./capacitor', () => ({
  isCapacitor: () => isCapacitorMock(),
}));

vi.mock('./openExternalUrl', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
}));

describe('openTelegramUser', () => {
  afterEach(() => {
    isCapacitorMock.mockReturnValue(false);
    openExternalUrl.mockClear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens t.me without a web fallback when username exists', async () => {
    await openTelegramUser({ telegramUsername: 'player', telegramId: '64171282' });
    expect(openExternalUrl).toHaveBeenCalledTimes(1);
    expect(openExternalUrl).toHaveBeenCalledWith('https://t.me/player');
  });

  it('opens desktop Telegram by id and skips web if the app takes focus', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' });
    vi.useFakeTimers();
    const pending = openTelegramUser({ telegramId: '64171282' });
    await Promise.resolve();
    window.dispatchEvent(new Event('blur'));
    await pending;
    expect(openExternalUrl).toHaveBeenCalledTimes(1);
    expect(openExternalUrl).toHaveBeenCalledWith('tg://user?id=64171282');
  });

  it('falls back to Telegram Web on desktop if the app does not open', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' });
    vi.useFakeTimers();
    const pending = openTelegramUser({ telegramId: '64171282' });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(TELEGRAM_PROTOCOL_HANDOFF_MS);
    await pending;
    expect(openExternalUrl).toHaveBeenNthCalledWith(1, 'tg://user?id=64171282');
    expect(openExternalUrl).toHaveBeenNthCalledWith(
      2,
      'https://web.telegram.org/k/#64171282'
    );
  });

  it('falls back to Telegram Web on mobile if the app does not open', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    vi.useFakeTimers();
    const pending = openTelegramUser({ telegramId: '64171282' });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(TELEGRAM_PROTOCOL_HANDOFF_MS);
    await pending;
    expect(openExternalUrl).toHaveBeenNthCalledWith(1, 'tg://openmessage?user_id=64171282');
    expect(openExternalUrl).toHaveBeenNthCalledWith(
      2,
      'https://web.telegram.org/k/#64171282'
    );
  });
});
