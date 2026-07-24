/** LLM must return exactly this when source is already in the target language. */
export const NO_TRANSLATION_NEEDED_MARKER = '[[NO_TRANSLATION_NEEDED]]';

const MARKER_BODY_RE = /^\[?\s*NO[\s_-]*TRANSLATION[\s_-]*NEEDED\s*\]?$/i;

export function normalizeTranslationOutput(text: string): string {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/u, '');
  }
  s = s.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2) ||
    (s.startsWith('“') && s.endsWith('”') && s.length >= 2) ||
    (s.startsWith('«') && s.endsWith('»') && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** NFC + collapse whitespace for stable equality / similarity. */
export function canonicalizeForCompare(text: string): string {
  return normalizeTranslationOutput(text)
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * True when the model reply is the no-translation sentinel (exact or common variants).
 * Rejects replies that still contain other natural-language content.
 */
export function isNoTranslationNeededMarker(text: string): boolean {
  const s = normalizeTranslationOutput(text);
  if (!s) {
    return false;
  }
  if (s === NO_TRANSLATION_NEEDED_MARKER) {
    return true;
  }
  if (s.toUpperCase() === NO_TRANSLATION_NEEDED_MARKER.toUpperCase()) {
    return true;
  }
  // Whole reply is a short sentinel variant (brackets optional, separators flexible).
  if (s.length <= 64 && MARKER_BODY_RE.test(s)) {
    return true;
  }
  const compact = s.replace(/[\s_[\](){}«»"']/g, '').toUpperCase();
  return compact === 'NOTRANSLATIONNEEDED';
}

export function translationEqualsSource(source: string, translation: string): boolean {
  const s = canonicalizeForCompare(source);
  const t = canonicalizeForCompare(translation);
  if (!s || !t) {
    return false;
  }
  return s === t;
}
