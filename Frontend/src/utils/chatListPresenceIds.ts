import type { ChatItem } from '@/components/chat/chatListTypes';
import type { BasicUser } from '@/types';

export type ChatSearchRow =
  | { type: 'section'; label: string }
  | { type: 'chat'; data: ChatItem }
  | { type: 'contact'; user: BasicUser };

function addId(set: Set<string>, id: string | null | undefined) {
  if (typeof id === 'string' && id.length > 0) set.add(id);
}

function collectFromChannelOrGroupData(data: { buyer?: { id?: string } | null; bug?: { sender?: { id?: string } | null }; lastMessage?: unknown }, set: Set<string>) {
  addId(set, data.buyer?.id);
  addId(set, data.bug?.sender?.id);
  const lm = data.lastMessage as Record<string, unknown> | null | undefined;
  if (!lm) return;
  if (typeof lm.senderId === 'string') addId(set, lm.senderId);
  const sender = lm.sender as { id?: string } | undefined;
  if (sender && typeof sender.id === 'string') addId(set, sender.id);
}

export function collectChatListPresenceUserIds(chats: ChatItem[], currentUserId: string | undefined): string[] {
  const set = new Set<string>();
  for (const chat of chats) {
    if (chat.type === 'user') {
      const d = chat.data;
      if (currentUserId) {
        addId(set, d.user1Id === currentUserId ? d.user2Id : d.user1Id);
      } else {
        addId(set, d.user1Id);
        addId(set, d.user2Id);
      }
    } else if (chat.type === 'contact') {
      addId(set, chat.userId);
    } else if (chat.type === 'group' || chat.type === 'channel') {
      collectFromChannelOrGroupData(chat.data, set);
    }
  }
  return Array.from(set);
}

export function collectSearchRowsPresenceUserIds(rows: ChatSearchRow[], currentUserId: string | undefined): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.type === 'chat') {
      const chat = row.data;
      if (chat.type === 'user') {
        const d = chat.data;
        if (currentUserId) {
          addId(set, d.user1Id === currentUserId ? d.user2Id : d.user1Id);
        } else {
          addId(set, d.user1Id);
          addId(set, d.user2Id);
        }
      } else if (chat.type === 'group' || chat.type === 'channel') {
        collectFromChannelOrGroupData(chat.data, set);
      }
    } else if (row.type === 'contact') {
      addId(set, row.user.id);
    }
  }
  return Array.from(set);
}
