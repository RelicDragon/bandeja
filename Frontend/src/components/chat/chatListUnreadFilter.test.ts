import { describe, expect, it } from 'vitest';
import { chatListUnreadFilterCount, shouldShowChatListUnreadFilter } from './chatListUnreadFilter';

const zeroBadges = { users: 0, bugs: 0, channels: 0, market: 0 };

describe('chatListUnreadFilterCount', () => {
  it('returns 0 while unread store is cold even if legacy list items had unread', () => {
    const legacyInflated = 5;
    expect(
      chatListUnreadFilterCount(false, 'users', { ...zeroBadges, users: legacyInflated })
    ).toBe(0);
  });

  it('uses subtab badge from warm store', () => {
    expect(chatListUnreadFilterCount(true, 'users', { ...zeroBadges, users: 3 })).toBe(3);
    expect(chatListUnreadFilterCount(true, 'users', zeroBadges)).toBe(0);
  });
});

describe('shouldShowChatListUnreadFilter', () => {
  it('never shows mail control at zero count', () => {
    expect(shouldShowChatListUnreadFilter(0)).toBe(false);
    expect(shouldShowChatListUnreadFilter(1)).toBe(true);
  });
});
