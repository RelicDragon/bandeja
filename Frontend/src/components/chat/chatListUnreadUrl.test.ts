import { describe, expect, it } from 'vitest';
import {
  CHAT_LIST_UNREAD_URL_PARAM,
  clearChatListUnreadUrlParam,
  isChatListUnreadUrlActive,
  toggleChatListUnreadUrlParam,
} from './chatListUnreadUrl';

describe('chatListUnreadUrl', () => {
  it('detects unread=1', () => {
    expect(isChatListUnreadUrlActive(new URLSearchParams('unread=1'))).toBe(true);
    expect(isChatListUnreadUrlActive(new URLSearchParams())).toBe(false);
  });

  it('toggles unread param', () => {
    const off = new URLSearchParams('filter=bugs');
    const on = toggleChatListUnreadUrlParam(off);
    expect(on.get(CHAT_LIST_UNREAD_URL_PARAM)).toBe('1');
    const offAgain = toggleChatListUnreadUrlParam(on);
    expect(offAgain.has(CHAT_LIST_UNREAD_URL_PARAM)).toBe(false);
  });

  it('clears unread param', () => {
    const cleared = clearChatListUnreadUrlParam(new URLSearchParams('unread=1&q=foo'));
    expect(cleared.has(CHAT_LIST_UNREAD_URL_PARAM)).toBe(false);
    expect(cleared.get('q')).toBe('foo');
  });
});
