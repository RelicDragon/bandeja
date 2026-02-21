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

export function getTranslationLanguageByCode(code: string): { code: string; label: string } | undefined {
  return BY_CODE.get(code.toLowerCase());
}

export function getTranslationLanguageFlag(code: string): string {
  return getLanguageFlag(code);
}
