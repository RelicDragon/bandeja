import type { ChatContextType, GroupChannel, UserChat as UserChatType } from '@/api/chat';
import type { ChatType } from '@/types';
export type { ThreadOpenOptions, ThreadSessionScroll } from '@/services/chat/threadSession';

export interface LocationState {
  initialChatType?: ChatType;
  contextType?: ChatContextType;
  chat?: UserChatType;
  groupChannel?: GroupChannel;
  /** Monotonic nonce — forces thread reset + bootstrap (push tap). */
  forceReload?: number;
  anchorMessageId?: string;
  fromExpressInterest?: boolean;
}

export type ChatNavigateOptions = {
  forceReload?: boolean;
  anchorMessageId?: string;
  initialChatType?: string;
};

export interface GameChatProps {
  isEmbedded?: boolean;
  chatId?: string;
  chatType?: 'user' | 'bug' | 'game' | 'group' | 'channel';
}

function contextTypeFromPropChatType(propChatType?: GameChatProps['chatType']): ChatContextType | null {
  if (propChatType === 'user') return 'USER';
  if (propChatType === 'group' || propChatType === 'channel' || propChatType === 'bug') return 'GROUP';
  if (propChatType === 'game') return 'GAME';
  return null;
}

export function getContextTypeFromRoute(
  pathname: string,
  state: LocationState | null,
  isEmbedded: boolean,
  propChatType?: GameChatProps['chatType']
): ChatContextType {
  const fromProp = contextTypeFromPropChatType(propChatType);
  if (isEmbedded) {
    return fromProp ?? 'GAME';
  }
  if (state?.contextType) return state.contextType;
  if (pathname.includes('/user-chat/')) return 'USER';
  if (pathname.includes('/group-chat/') || pathname.includes('/channel-chat/') || /^\/bugs\/[^/]+$/.test(pathname)) return 'GROUP';
  return fromProp ?? 'GAME';
}
