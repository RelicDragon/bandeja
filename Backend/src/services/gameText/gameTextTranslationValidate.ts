import { GameTextTranslationError } from './gameTextTranslationErrors';

const NAME_MAX_CHARS = 500;
const DESCRIPTION_MAX_CHARS = 20_000;
const LENGTH_RATIO_CAP = 3.5;
const LENGTH_ABS_PAD = 80;

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

export function extractUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

export function extractNumbers(text: string): string[] {
  return text.match(NUMBER_RE) ?? [];
}

export function assertPreservedFacts(params: {
  field: 'name' | 'description';
  source: string;
  translated: string;
}): void {
  const { field, source, translated } = params;
  const maxChars = field === 'name' ? NAME_MAX_CHARS : DESCRIPTION_MAX_CHARS;
  if (translated.length > maxChars) {
    throw new GameTextTranslationError(
      `${field} translation exceeds ${maxChars} characters`,
      'validation',
    );
  }
  const maxAllowed = Math.ceil(source.length * LENGTH_RATIO_CAP) + LENGTH_ABS_PAD;
  if (translated.length > maxAllowed) {
    throw new GameTextTranslationError(
      `${field} translation length ${translated.length} exceeds bound ${maxAllowed}`,
      'validation',
    );
  }

  for (const url of extractUrls(source)) {
    if (!translated.includes(url)) {
      throw new GameTextTranslationError(
        `${field} translation dropped URL ${url}`,
        'validation',
      );
    }
  }

  const sourceNumbers = extractNumbers(source);
  const translatedNumbers = extractNumbers(translated);
  for (const num of sourceNumbers) {
    if (!translatedNumbers.includes(num)) {
      throw new GameTextTranslationError(
        `${field} translation dropped number ${num}`,
        'validation',
      );
    }
  }
}
