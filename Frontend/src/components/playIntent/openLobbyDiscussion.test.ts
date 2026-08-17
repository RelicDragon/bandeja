// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { openLobbyDiscussion } from './openLobbyDiscussion';

describe('openLobbyDiscussion', () => {
  it('opens or creates a 1:1 user chat for one other player', async () => {
    const getOrCreateUserChat = vi.fn().mockResolvedValue({ id: 'dm-1' });
    const discussGroup = vi.fn();
    const navigate = vi.fn();

    await openLobbyDiscussion({
      viewerId: 'viewer',
      otherUserIds: ['two', 'viewer'],
      getOrCreateUserChat,
      discussGroup,
      navigate,
    });

    expect(getOrCreateUserChat).toHaveBeenCalledWith('two');
    expect(discussGroup).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/user-chat/dm-1', {
      state: { chat: { id: 'dm-1' }, contextType: 'USER' },
    });
  });

  it('finds or creates an exact-member group for two or more other players', async () => {
    const getOrCreateUserChat = vi.fn();
    const discussGroup = vi.fn().mockResolvedValue({ id: 'group-1' });
    const navigate = vi.fn();
    const refresh = vi.fn();
    window.addEventListener('refresh-chat-list', refresh);

    await openLobbyDiscussion({
      viewerId: 'viewer',
      otherUserIds: ['two', 'three', 'two'],
      getOrCreateUserChat,
      discussGroup,
      navigate,
    });

    window.removeEventListener('refresh-chat-list', refresh);
    expect(getOrCreateUserChat).not.toHaveBeenCalled();
    expect(discussGroup).toHaveBeenCalledWith(['two', 'three']);
    expect(refresh).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/group-chat/group-1', {
      state: { groupChannel: { id: 'group-1' }, contextType: 'GROUP' },
    });
  });

  it('throws when group create-or-open returns no id', async () => {
    await expect(
      openLobbyDiscussion({
        viewerId: 'viewer',
        otherUserIds: ['two', 'three'],
        getOrCreateUserChat: vi.fn(),
        discussGroup: vi.fn().mockResolvedValue(null),
        navigate: vi.fn(),
      }),
    ).rejects.toThrow('errors.generic');
  });
});
