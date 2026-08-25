import { describe, expect, it, vi } from 'vitest';
import { buildTelegramBotStartUrl } from './telegramBotUrl';

vi.mock('@/config/media', () => ({
  config: { telegramBotUrl: 'https://t.me/bandeja_padel_bot' },
}));

const isCapacitorMock = vi.fn(() => false);
vi.mock('./capacitor', () => ({
  isCapacitor: () => isCapacitorMock(),
}));

describe('buildTelegramBotStartUrl', () => {
  it('builds https start payload on web', () => {
    isCapacitorMock.mockReturnValue(false);
    expect(buildTelegramBotStartUrl('link_abc123')).toBe(
      'https://t.me/bandeja_padel_bot?start=link_abc123'
    );
  });

  it('builds login start payload on web', () => {
    isCapacitorMock.mockReturnValue(false);
    expect(buildTelegramBotStartUrl('login')).toBe(
      'https://t.me/bandeja_padel_bot?start=login'
    );
  });

  it('opens Telegram app directly on native', () => {
    isCapacitorMock.mockReturnValue(true);
    expect(buildTelegramBotStartUrl('link_abc123')).toBe(
      'tg://resolve?domain=bandeja_padel_bot&start=link_abc123'
    );
  });
});
