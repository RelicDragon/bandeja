/**
 * App UI languages shown in the product (not the broader chat translation list).
 * Serbian targets Latin script; Chinese targets Simplified characters.
 */
export const APP_UI_LANGUAGES = [
  'en',
  'ru',
  'sr',
  'es',
  'cs',
  'ar',
  'zh',
  'id',
  'hi',
  'th',
  'ja',
] as const;

export type AppUiLanguage = (typeof APP_UI_LANGUAGES)[number];

export const APP_UI_FALLBACK_LANGUAGE: AppUiLanguage = 'en';

export type AppUiLanguageMeta = {
  englishName: string;
  /** Explicit translation-target notes (script / orthography). */
  notes?: string;
  /** ISO 15924 script when the product pins one. */
  script?: string;
};

export const APP_UI_LANGUAGE_META: Record<AppUiLanguage, AppUiLanguageMeta> = {
  en: { englishName: 'English' },
  ru: { englishName: 'Russian' },
  sr: {
    englishName: 'Serbian',
    notes: 'Serbian Latin (not Cyrillic)',
    script: 'Latn',
  },
  es: { englishName: 'Spanish' },
  cs: { englishName: 'Czech' },
  ar: { englishName: 'Arabic' },
  zh: {
    englishName: 'Chinese',
    notes: 'Chinese Simplified',
    script: 'Hans',
  },
  id: { englishName: 'Indonesian' },
  hi: { englishName: 'Hindi' },
  th: { englishName: 'Thai' },
  ja: { englishName: 'Japanese' },
};

export function isAppUiLanguage(code: string): code is AppUiLanguage {
  return (APP_UI_LANGUAGES as readonly string[]).includes(code);
}

export function extractAppUiLanguageCode(locale: string | null | undefined): string {
  if (!locale || locale === 'auto') {
    return APP_UI_FALLBACK_LANGUAGE;
  }
  const parts = locale.split(/[-_]/);
  return (parts[0] ?? APP_UI_FALLBACK_LANGUAGE).toLowerCase();
}

export function normalizeAppUiLanguage(locale: string | null | undefined): AppUiLanguage {
  const code = extractAppUiLanguageCode(locale);
  return isAppUiLanguage(code) ? code : APP_UI_FALLBACK_LANGUAGE;
}
