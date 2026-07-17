export const TELEGRAM_APP_HANDOFF_PARAM = 'tg_app';
export const TELEGRAM_APP_FALLBACK_PARAM = 'tg_fallback';
export const TELEGRAM_WEB_CONTINUE_PARAM = 'tg_web';
export const ANDROID_APP_PACKAGE = 'com.funified.bandeja';
export const ANDROID_APP_SCHEME = 'com.funified.bandeja';

export function isAndroidUserAgent(userAgent: string | undefined): boolean {
  return /Android/i.test(userAgent || '');
}

export function shouldUseTelegramAppHandoff(
  searchParams: URLSearchParams,
  isNativeApp: boolean,
  isAndroidBrowser: boolean
): boolean {
  return (
    !isNativeApp &&
    isAndroidBrowser &&
    searchParams.get(TELEGRAM_APP_HANDOFF_PARAM) === '1' &&
    searchParams.get(TELEGRAM_WEB_CONTINUE_PARAM) !== '1'
  );
}

export function buildTelegramBrowserContinueUrl(
  origin: string,
  telegramKey: string
): string {
  const url = new URL(`/login/${telegramKey}`, origin);
  url.searchParams.set(TELEGRAM_WEB_CONTINUE_PARAM, '1');
  return url.href;
}

export function buildTelegramAppFallbackUrl(
  origin: string,
  telegramKey: string
): string {
  const url = new URL(`/login/${telegramKey}`, origin);
  url.searchParams.set(TELEGRAM_APP_HANDOFF_PARAM, '1');
  url.searchParams.set(TELEGRAM_APP_FALLBACK_PARAM, '1');
  return url.href;
}

export function shouldAutoOpenTelegramApp(searchParams: URLSearchParams): boolean {
  return searchParams.get(TELEGRAM_APP_FALLBACK_PARAM) !== '1';
}

export function buildTelegramAndroidIntentUrl(
  origin: string,
  telegramKey: string,
  fallbackUrl: string
): string {
  const appUrl = new URL(`/login/${telegramKey}`, origin);
  return `intent://${appUrl.host}${appUrl.pathname}#Intent;scheme=${ANDROID_APP_SCHEME};package=${ANDROID_APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(
    fallbackUrl
  )};end`;
}
