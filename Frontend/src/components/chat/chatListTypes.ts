import { ChatItem } from '@/utils/chatListSort';

export type { ChatItem };
export type ChatType = 'user' | 'bug' | 'group' | 'channel' | 'game';

export interface ChatListProps {
  onChatSelect?: (chatId: string, chatType: ChatType, options?: { initialChatType?: string; searchQuery?: string }) => void;
  isDesktop?: boolean;
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
}
