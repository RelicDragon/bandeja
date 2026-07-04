import type { ChatContextType } from '@/api/chat';

export function canUseLiveThreadIngress(params: {
  contextType: ChatContextType;
  isLoadingContext: boolean;
  isGameChatArchived: boolean;
  isGameChatAccessDenied: boolean;
}): boolean {
  const {
    contextType,
    isLoadingContext,
    isGameChatArchived,
    isGameChatAccessDenied,
  } = params;

  if (contextType !== 'GAME') return true;
  if (isLoadingContext) return false;
  if (isGameChatArchived) return false;
  if (isGameChatAccessDenied) return false;
  return true;
}
