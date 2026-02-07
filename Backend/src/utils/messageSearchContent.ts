import transliterate from '@sindresorhus/transliterate';

export function normalizeForSearch(text: string | null): string | null {
  if (!text?.trim()) return null;
  try {
    return transliterate(text).toLowerCase().trim();
  } catch {
    return text.toLowerCase().trim();
  }
}

export function extractSearchableContent(
  content: string | null,
  pollQuestion?: string
): string | null {
  if (!content?.trim() && !pollQuestion?.trim()) return null;
  if (content?.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      return parsed.text ?? parsed.question ?? pollQuestion ?? null;
    } catch { return content; }
  }
  if (content?.trim().startsWith('[TYPE:')) return pollQuestion?.trim() || null;
  return content?.trim() || pollQuestion?.trim() || null;
}

export function computeContentSearchable(
  content: string | null,
  pollQuestion?: string
): string | null {
  const extracted = extractSearchableContent(content, pollQuestion);
  return extracted ? normalizeForSearch(extracted) : null;
}
