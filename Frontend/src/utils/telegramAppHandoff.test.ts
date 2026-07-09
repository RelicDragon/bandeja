import { describe, expect, it } from 'vitest';
import {
  ANDROID_APP_PACKAGE,
  buildTelegramAndroidIntentUrl,
  buildTelegramAppFallbackUrl,
  buildTelegramBrowserContinueUrl,
  isAndroidUserAgent,
  shouldAutoOpenTelegramApp,
  shouldUseTelegramAppHandoff,
} from './telegramAppHandoff';

const key = '550e8400-e29b-41d4-a716-446655440000';

describe('telegram app handoff', () => {
  it('uses the handoff only for marked Android browser links', () => {
    expect(shouldUseTelegramAppHandoff(new URLSearchParams('tg_app=1'), false, true)).toBe(true);
    expect(shouldUseTelegramAppHandoff(new URLSearchParams('tg_app=1'), true, true)).toBe(false);
    expect(shouldUseTelegramAppHandoff(new URLSearchParams('tg_app=1'), false, false)).toBe(false);
    expect(shouldUseTelegramAppHandoff(new URLSearchParams('tg_app=1&tg_web=1'), false, true)).toBe(false);
    expect(shouldUseTelegramAppHandoff(new URLSearchParams(''), false, true)).toBe(false);
  });

  it('detects Android user agents', () => {
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true);
    expect(isAndroidUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
    expect(isAndroidUserAgent(undefined)).toBe(false);
  });

  it('does not auto-open the app after Android returns to the fallback page', () => {
    expect(shouldAutoOpenTelegramApp(new URLSearchParams('tg_app=1'))).toBe(true);
    expect(shouldAutoOpenTelegramApp(new URLSearchParams('tg_app=1&tg_fallback=1'))).toBe(false);
  });

  it('builds browser continue and Android intent URLs without consuming the fallback automatically', () => {
    const fallbackUrl = buildTelegramAppFallbackUrl('https://bandeja.me', key);
    const browserUrl = buildTelegramBrowserContinueUrl('https://bandeja.me', key);
    const intentUrl = buildTelegramAndroidIntentUrl('https://bandeja.me', key, fallbackUrl);

    expect(fallbackUrl).toBe(`https://bandeja.me/login/${key}?tg_app=1&tg_fallback=1`);
    expect(browserUrl).toBe(`https://bandeja.me/login/${key}?tg_web=1`);
    expect(intentUrl).toContain(`intent://bandeja.me/login/${key}#Intent;scheme=https`);
    expect(intentUrl).toContain(`package=${ANDROID_APP_PACKAGE}`);
    expect(intentUrl).toContain(encodeURIComponent(fallbackUrl));
  });
});
