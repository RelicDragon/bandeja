import { ChatDraft, ChatContextType, ChatType, UserChat, GroupChannel, ChatMessage } from '@/api/chat';
import { Game, BasicUser } from '@/types';

export interface UnifiedChatItem {
  id: string;
  type: 'user' | 'group' | 'contact' | 'game';
  title: string;
  subtitle?: string;
  avatar?: string | null;
  lastMessage?: ChatMessage | null;
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
  const lastMessageTime = item.lastMessage
    ? new Date(item.lastMessage.createdAt).getTime()
    : 0;
  const draftTime = item.draft
    ? new Date(item.draft.updatedAt).getTime()
    : 0;
  return Math.max(lastMessageTime, draftTime);
};

export const getDisplayText = (item: UnifiedChatItem): { text: string; isDraft: boolean } => {
  const lastMessageTime = item.lastMessage
    ? new Date(item.lastMessage.createdAt).getTime()
    : 0;
  const draftTime = item.draft
    ? new Date(item.draft.updatedAt).getTime()
    : 0;

  // Show draft if it exists and is newer than last message, or if there's no last message
  if (item.draft && (draftTime > lastMessageTime || !item.lastMessage)) {
    const draftContent = item.draft.content || '';
    if (draftContent.trim()) {
      const truncated = draftContent.length > 60 
        ? draftContent.substring(0, 60) + '...' 
        : draftContent;
      return { text: `Draft: ${truncated}`, isDraft: true };
    } else {
      // Draft exists but has no content - still show "Draft:" to indicate there's a draft
      return { text: 'Draft:', isDraft: true };
    }
  }

  if (item.lastMessage) {
    const content = item.lastMessage.content || '';
    const truncated = content.length > 60 
      ? content.substring(0, 60) + '...' 
      : content;
    return { text: truncated, isDraft: false };
  }

  return { text: '', isDraft: false };
};

export const getDisplayTimestamp = (item: UnifiedChatItem): Date => {
  const lastMessageTime = item.lastMessage
    ? new Date(item.lastMessage.createdAt).getTime()
    : 0;
  const draftTime = item.draft
    ? new Date(item.draft.updatedAt).getTime()
    : 0;

  if (draftTime > lastMessageTime && item.draft) {
    return new Date(item.draft.updatedAt);
  }

  if (item.lastMessage) {
    return new Date(item.lastMessage.createdAt);
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
