export const TRANSLATION_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  sr: 'Serbian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  hr: 'Croatian',
  bg: 'Bulgarian',
  ro: 'Romanian',
  hu: 'Hungarian',
  el: 'Greek',
  tr: 'Turkish',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

export const TRANSLATE_TO_LANGUAGE_CODES = Object.keys(TRANSLATION_LANGUAGE_NAMES);

interface TranslationTargetUser {
  language: string | null;
  translateToLanguage?: string | null;
}

export function extractTranslationLanguageCode(locale: string | null | undefined): string {
  if (!locale || locale === 'auto') {
    return 'en';
  }
  const parts = locale.split('-');
  return parts[0]?.toLowerCase() || 'en';
}

export function resolveTranslationTargetLanguage(user: TranslationTargetUser | null): string {
  const preferred = user?.translateToLanguage?.trim().toLowerCase();
  if (preferred && TRANSLATE_TO_LANGUAGE_CODES.includes(preferred)) {
    return preferred;
  }
  return extractTranslationLanguageCode(user?.language);
}
