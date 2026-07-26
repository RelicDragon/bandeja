export function resolveExpandedStackKey(
  expandedKey: string | null,
  validKeys: ReadonlySet<string>,
): string | null {
  return expandedKey != null && validKeys.has(expandedKey) ? expandedKey : null;
}

export function nextExpandedStackKey(
  prev: string | null,
  key: string,
  expand: boolean,
): string | null {
  if (!expand) return prev === key ? null : prev;
  return key;
}
