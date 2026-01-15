export function extractLanguageCode(locale: string | null | undefined): string {
  if (!locale || locale === 'auto') {
    const browserLang = navigator.language || navigator.languages?.[0] || 'en';
    const parts = browserLang.split('-');
    return parts[0]?.toLowerCase() || 'en';
  }
  const parts = locale.split('-');
  return parts[0]?.toLowerCase() || 'en';
}
