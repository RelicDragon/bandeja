/** True when caret is in an active @-mention query (mirrors react-mentions trigger). */
export function isActiveMentionQuery(text: string, caret?: number | null): boolean {
  const end = caret ?? text.length;
  if (end <= 0) return false;
  return /(?:^|\s)@[^\s@]*$/.test(text.slice(0, end));
}
