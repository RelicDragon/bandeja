import type { ChatType } from '@/components/chat/ChatList';

export type ChatSelection = {
  id: string | null;
  type: ChatType | null;
};

export function parseChatSelectionFromPath(pathname: string): ChatSelection {
  if (pathname.includes('/user-chat/')) {
    const id = pathname.split('/user-chat/')[1]?.split('/')[0];
    return id ? { id, type: 'user' } : { id: null, type: null };
  }
  if (pathname.includes('/group-chat/')) {
    const id = pathname.split('/group-chat/')[1]?.split('/')[0];
    return id ? { id, type: 'group' } : { id: null, type: null };
  }
  const bugsMatch = pathname.match(/^\/bugs\/([^/]+)$/);
  if (bugsMatch?.[1]) {
    return { id: bugsMatch[1], type: 'channel' };
  }
  if (pathname.includes('/channel-chat/')) {
    const id = pathname.split('/channel-chat/')[1]?.split('/')[0];
    return id ? { id, type: 'channel' } : { id: null, type: null };
  }
  const gameMatch = pathname.match(/^\/games\/([^/]+)\/chat$/);
  if (gameMatch?.[1]) {
    return { id: gameMatch[1], type: 'game' };
  }
  if (pathname === '/chats' || pathname === '/chats/marketplace' || pathname === '/bugs') {
    return { id: null, type: null };
  }
  return { id: null, type: null };
}

export function chatSelectionKey(selection: ChatSelection): string | null {
  return selection.id && selection.type ? `${selection.type}-${selection.id}` : null;
}
