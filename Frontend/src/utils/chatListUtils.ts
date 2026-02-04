import {
  ChatDraft,
  ChatContextType,
  ChatType,
  UserChat,
  GroupChannel,
  ChatMessage,
  LastMessagePreview,
  getLastMessageTime,
  getLastMessageText,
} from '@/api/chat';
import { Game, BasicUser } from '@/types';

export interface UnifiedChatItem {
  id: string;
  type: 'user' | 'group' | 'contact' | 'game';
  title: string;
  subtitle?: string;
  avatar?: string | null;
  lastMessage?: ChatMessage | LastMessagePreview | null;
  draft?: ChatDraft | null;
  sortTimestamp: number;
  game?: Game;
  userChat?: UserChat;
  groupChannel?: GroupChannel;
  contactUser?: BasicUser;
  chatContextType: ChatContextType;
  contextId: string;
  chatType?: ChatType;
  otherUser?: BasicUser;
}

export const matchDraftToChat = (
  drafts: ChatDraft[],
  chatContextType: ChatContextType,
  contextId: string,
  chatType?: ChatType
): ChatDraft | null => {
  if (!chatType) {
    const matchingDrafts = drafts.filter(
      (d) => d.chatContextType === chatContextType && d.contextId === contextId
    );
    if (matchingDrafts.length === 0) return null;
    return matchingDrafts.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
  }

  const draft = drafts.find(
    (d) =>
      d.chatContextType === chatContextType &&
      d.contextId === contextId &&
      d.chatType === chatType
  );

  return draft || null;
};

export const getSortTimestamp = (item: UnifiedChatItem): number => {
  const lastMessageTime = getLastMessageTime(item.lastMessage);
  const draftTime = item.draft ? new Date(item.draft.updatedAt).getTime() : 0;
  return Math.max(lastMessageTime, draftTime);
};

export const getDisplayText = (item: UnifiedChatItem): { text: string; isDraft: boolean } => {
  const lastMessageTime = getLastMessageTime(item.lastMessage);
  const draftTime = item.draft ? new Date(item.draft.updatedAt).getTime() : 0;

  if (item.draft && (draftTime > lastMessageTime || !item.lastMessage)) {
    const draftContent = item.draft.content || '';
    if (draftContent.trim()) {
      const truncated = draftContent.length > 60 ? draftContent.substring(0, 60) + '...' : draftContent;
      return { text: `Draft: ${truncated}`, isDraft: true };
    }
    return { text: 'Draft:', isDraft: true };
  }

  if (item.lastMessage) {
    const text = getLastMessageText(item.lastMessage);
    const truncated = text.length > 60 ? text.substring(0, 60) + '...' : text;
    return { text: truncated, isDraft: false };
  }

  return { text: '', isDraft: false };
};

export const getDisplayTimestamp = (item: UnifiedChatItem): Date => {
  const lastMessageTime = getLastMessageTime(item.lastMessage);
  const draftTime = item.draft ? new Date(item.draft.updatedAt).getTime() : 0;

  if (draftTime > lastMessageTime && item.draft) {
    return new Date(item.draft.updatedAt);
  }

  if (item.lastMessage) {
    const m = item.lastMessage;
    return new Date('updatedAt' in m ? m.updatedAt : (m as ChatMessage).createdAt);
  }

  return new Date(0);
};

export const sortChatsByActivity = (items: UnifiedChatItem[]): UnifiedChatItem[] => {
  return [...items].sort((a, b) => {
    // Use pre-calculated sortTimestamp which includes fallbackTime
    const timeA = a.sortTimestamp;
    const timeB = b.sortTimestamp;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.title.localeCompare(b.title);
  });
};
