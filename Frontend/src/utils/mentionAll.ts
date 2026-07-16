export const ALL_MENTION_ID = 'all';
export const ALL_MENTION_DISPLAY = 'all';

export function isAllMentionId(id: string | null | undefined): boolean {
  return id === ALL_MENTION_ID;
}

/** Expand `@all` into concrete participant user ids (excludes `excludeUserId`). */
export function expandMentionIds(
  mentionIds: string[],
  allUserIds: string[],
  excludeUserId?: string | null
): string[] {
  const hasAll = mentionIds.some(isAllMentionId);
  const ids = new Set(mentionIds.filter((id) => !isAllMentionId(id)));
  if (hasAll) {
    for (const id of allUserIds) {
      if (excludeUserId && id === excludeUserId) continue;
      ids.add(id);
    }
  }
  return Array.from(ids);
}

export function matchesAllMentionQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return ALL_MENTION_DISPLAY.startsWith(trimmed) || trimmed === ALL_MENTION_DISPLAY;
}
