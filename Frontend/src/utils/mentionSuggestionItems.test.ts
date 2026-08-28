import { describe, expect, it } from 'vitest';
import { buildMentionSuggestionItems } from '@/utils/mentionSuggestionItems';
import { ALL_MENTION_ID } from '@/utils/mentionAll';
import type { MentionableUser } from '@/utils/mentionableUsers';

const users: MentionableUser[] = Array.from({ length: 30 }, (_, index) => ({
  id: `user-${index}`,
  firstName: `First${index}`,
  lastName: `Last${index}`,
  display: `First${index} Last${index}`,
}));

describe('buildMentionSuggestionItems', () => {
  it('includes @all and caps empty-query suggestions', () => {
    const items = buildMentionSuggestionItems('', users);
    expect(items[0]?.id).toBe(ALL_MENTION_ID);
    expect(items).toHaveLength(20);
  });

  it('filters by query and still caps results', () => {
    const items = buildMentionSuggestionItems('first1', users);
    expect(items.some((item) => item.id === ALL_MENTION_ID)).toBe(false);
    expect(items.every((item) => String(item.display).includes('First1'))).toBe(true);
    expect(items.length).toBeLessThanOrEqual(20);
  });

  it('returns empty list when there are no mentionable users', () => {
    expect(buildMentionSuggestionItems('', [])).toEqual([]);
  });
});
