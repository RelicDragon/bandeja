import type { ChatContextType, UserChat as UserChatType } from '@/api/chat';
import type { ChatType } from '@/types';

export interface LocationState {
  initialChatType?: ChatType;
  contextType?: ChatContextType;
  chat?: UserChatType;
  forceReload?: number;
  fromExpressInterest?: boolean;
}

export interface GameChatProps {
  isEmbedded?: boolean;
  chatId?: string;
  chatType?: 'user' | 'bug' | 'game' | 'group' | 'channel';
}

export function getContextTypeFromRoute(
  pathname: string,
  state: LocationState | null,
  isEmbedded: boolean,
  propChatType?: GameChatProps['chatType']
): ChatContextType {
  if (isEmbedded) {
    return propChatType === 'user' ? 'USER' : (propChatType === 'group' || propChatType === 'channel' || propChatType === 'bug') ? 'GROUP' : 'GAME';
  }
  if (state?.contextType) return state.contextType;
  if (pathname.includes('/user-chat/')) return 'USER';
  if (pathname.includes('/group-chat/') || pathname.includes('/channel-chat/') || /^\/bugs\/[^/]+$/.test(pathname)) return 'GROUP';
  return 'GAME';
}
