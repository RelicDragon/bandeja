export function normalizeTranslationOutput(text: string): string {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/u, '');
  }
  s = s.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
