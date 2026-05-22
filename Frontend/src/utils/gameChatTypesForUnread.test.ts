import { describe, expect, it } from 'vitest';
import { getGameChatTypesForUnreadAndMarkRead } from './gameChatTypesForUnread';
import { getAvailableGameChatTypes } from './chatType';

describe('getGameChatTypesForUnreadAndMarkRead', () => {
  it('always includes PUBLIC', () => {
    expect(getGameChatTypesForUnreadAndMarkRead({ status: 'ANNOUNCED' })).toEqual(['PUBLIC']);
  });

  it('adds PRIVATE only for PLAYING (not NON_PLAYING)', () => {
    expect(
      getGameChatTypesForUnreadAndMarkRead(
        { status: 'SCHEDULED' },
        { status: 'PLAYING', role: 'PLAYER' }
      )
    ).toContain('PRIVATE');
    expect(
      getGameChatTypesForUnreadAndMarkRead(
        { status: 'SCHEDULED' },
        { status: 'NON_PLAYING', role: 'PLAYER' }
      )
    ).not.toContain('PRIVATE');
    expect(
      getAvailableGameChatTypes({ status: 'NON_PLAYING', role: 'PLAYER' })
    ).toContain('PRIVATE');
  });

  it('adds ADMINS for admin/owner or parent admin', () => {
    expect(
      getGameChatTypesForUnreadAndMarkRead(
        { status: 'SCHEDULED' },
        { status: 'PLAYING', role: 'ADMIN' }
      )
    ).toContain('ADMINS');
    expect(
      getGameChatTypesForUnreadAndMarkRead(
        { status: 'SCHEDULED' },
        { status: 'PLAYING', role: 'PLAYER' },
        { role: 'OWNER' }
      )
    ).toContain('ADMINS');
    expect(
      getGameChatTypesForUnreadAndMarkRead(
        { status: 'SCHEDULED' },
        { status: 'PLAYING', role: 'PLAYER' },
        null,
        true
      )
    ).toContain('ADMINS');
  });

  it('adds PHOTOS when status is not ANNOUNCED', () => {
    expect(getGameChatTypesForUnreadAndMarkRead({ status: 'SCHEDULED' })).toContain('PHOTOS');
    expect(getGameChatTypesForUnreadAndMarkRead({ status: 'ANNOUNCED' })).not.toContain('PHOTOS');
    expect(getAvailableGameChatTypes({ status: 'PLAYING', role: 'PLAYER' })).not.toContain('PHOTOS');
  });
});
