/** Whether to refresh react-mentions after roster transitions empty → non-empty. */
export function shouldRefreshMentionsOnRosterLoad(
  hadMentionableUsers: boolean,
  mentionableUserCount: number,
  composerText: string
): boolean {
  if (mentionableUserCount === 0) return false;
  if (hadMentionableUsers) return false;
  return composerText.includes('@');
}
