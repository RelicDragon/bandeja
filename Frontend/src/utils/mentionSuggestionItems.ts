import type { SuggestionDataItem } from 'react-mentions';
import type { MentionableUser } from '@/utils/mentionableUsers';
import { matchesSearch } from '@/utils/transliteration';
import {
  ALL_MENTION_DISPLAY,
  ALL_MENTION_ID,
  matchesAllMentionQuery,
} from '@/utils/mentionAll';

export const MENTION_SUGGESTION_LIMIT = 20;

export function buildMentionSuggestionItems(
  query: string,
  mentionableUsers: MentionableUser[],
  limit = MENTION_SUGGESTION_LIMIT
): SuggestionDataItem[] {
  const trimmed = query?.trim() ?? '';
  const filtered = trimmed
    ? mentionableUsers.filter((user) => {
        const display = user.display;
        const firstName = user.firstName || '';
        const lastName = user.lastName || '';
        return (
          matchesSearch(trimmed, display) ||
          matchesSearch(trimmed, firstName) ||
          matchesSearch(trimmed, lastName)
        );
      })
    : mentionableUsers;

  const items: SuggestionDataItem[] = [];
  if (mentionableUsers.length > 0 && matchesAllMentionQuery(trimmed)) {
    items.push({ id: ALL_MENTION_ID, display: ALL_MENTION_DISPLAY });
  }

  const remaining = Math.max(0, limit - items.length);
  for (const user of filtered.slice(0, remaining)) {
    items.push({
      id: user.id,
      display: user.display,
      user,
    } as SuggestionDataItem & { user: MentionableUser });
  }

  return items;
}
