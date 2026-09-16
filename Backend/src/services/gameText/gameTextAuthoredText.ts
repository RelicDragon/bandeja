/** Normalize authored game text for change detection only — never rewrite Game columns. */
export function normalizeAuthoredGameText(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function authoredGameTextEquals(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeAuthoredGameText(a) === normalizeAuthoredGameText(b);
}
