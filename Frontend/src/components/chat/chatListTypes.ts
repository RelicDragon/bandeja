import type { GroupChannel, UserChat } from '@/api/chat';
import { ChatItem } from '@/utils/chatListSort';

export type { ChatItem };
export type ChatType = 'user' | 'bug' | 'group' | 'channel' | 'game';

export type ChatSelectNavOptions = {
  initialChatType?: string;
  searchQuery?: string;
  userChat?: UserChat;
  groupChannel?: GroupChannel;
};

export interface ChatListProps {
  onChatSelect?: (chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => void;
  isDesktop?: boolean;
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
}
