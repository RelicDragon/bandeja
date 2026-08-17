type UserChatLike = { id: string };
type GroupChatLike = { id: string };

export async function openLobbyDiscussion(input: {
  viewerId: string;
  otherUserIds: string[];
  getOrCreateUserChat: (userId: string) => Promise<UserChatLike | null>;
  discussGroup: (userIds: string[]) => Promise<GroupChatLike>;
  navigate: (path: string, opts?: { state?: unknown }) => void;
}): Promise<void> {
  const otherUserIds = [...new Set(input.otherUserIds)].filter(
    (id) => id !== input.viewerId,
  );
  if (otherUserIds.length === 0) return;

  if (otherUserIds.length === 1) {
    const chat = await input.getOrCreateUserChat(otherUserIds[0]);
    if (!chat) {
      throw new Error('errors.generic');
    }
    input.navigate(`/user-chat/${chat.id}`, {
      state: { chat, contextType: 'USER' },
    });
    return;
  }

  const group = await input.discussGroup(otherUserIds);
  if (!group?.id) {
    throw new Error('errors.generic');
  }
  window.dispatchEvent(new CustomEvent('refresh-chat-list'));
  input.navigate(`/group-chat/${group.id}`, {
    state: { groupChannel: group, contextType: 'GROUP' },
  });
}
