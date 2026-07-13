import { getLanguageFlag } from '@/utils/countryFlag';

export const TRANSLATION_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'ru', label: 'Russian' },
  { code: 'sr', label: 'Serbian' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'cs', label: 'Czech' },
  { code: 'sk', label: 'Slovak' },
  { code: 'hr', label: 'Croatian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'el', label: 'Greek' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
];

const BY_CODE = new Map(TRANSLATION_LANGUAGES.map((l) => [l.code, l]));

/** Mirrors Backend TranslationService.extractLanguageCode for locale → target code. */
function extractBackendLanguageCode(locale: string | null | undefined): string {
  if (!locale || locale === 'auto') {
    return 'en';
  }
  const parts = locale.split('-');
  return parts[0]?.toLowerCase() || 'en';
}

/** Target language for incoming message translation (menu Translate action). */
export function resolveIncomingTranslationTargetCode(
  user: { translateToLanguage?: string | null; language?: string | null } | null | undefined
): string {
  const preferred = user?.translateToLanguage?.trim().toLowerCase();
  if (preferred && BY_CODE.has(preferred)) {
    return preferred;
  }
  return extractBackendLanguageCode(user?.language);
}

/** Default target when preferred translation is cleared (follows app language profile field). */
export function resolveAppLanguageTranslationTargetCode(
  user: { language?: string | null } | null | undefined
): string {
  return extractBackendLanguageCode(user?.language);
}

export function getTranslationLanguageByCode(code: string): { code: string; label: string } | undefined {
  return BY_CODE.get(code.toLowerCase());
}

export function getTranslationLanguageFlag(code: string): string {
  return getLanguageFlag(code);
}
