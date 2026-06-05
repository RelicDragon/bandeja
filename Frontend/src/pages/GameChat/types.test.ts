import { describe, expect, it } from 'vitest';
import { getContextTypeFromRoute } from './types';

describe('getContextTypeFromRoute', () => {
  it('uses pathname for user chat when not embedded', () => {
    expect(getContextTypeFromRoute('/user-chat/abc', null, false, undefined)).toBe('USER');
  });

  it('uses propChatType on /chats before URL updates (mobile search open)', () => {
    expect(getContextTypeFromRoute('/chats', null, false, 'user')).toBe('USER');
    expect(getContextTypeFromRoute('/chats?q=ann', null, false, 'group')).toBe('GROUP');
    expect(getContextTypeFromRoute('/chats', null, false, 'game')).toBe('GAME');
  });

  it('prefers pathname over prop when both are present', () => {
    expect(getContextTypeFromRoute('/user-chat/abc', null, false, 'game')).toBe('USER');
  });

  it('uses propChatType when embedded', () => {
    expect(getContextTypeFromRoute('/chats', null, true, 'user')).toBe('USER');
  });
});
