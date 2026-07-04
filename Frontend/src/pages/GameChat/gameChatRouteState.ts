import type { ChatContextType } from '@/api/chat';

export function resolveGameChatViewState(params: {
  isGameChatAccessDenied: boolean;
  canViewPublicChat: boolean;
}): 'denied' | 'thread' {
  const { isGameChatAccessDenied, canViewPublicChat } = params;
  if (isGameChatAccessDenied) return 'denied';
  return canViewPublicChat ? 'thread' : 'denied';
}

export function shouldInitializeGameChatContextLoading(params: {
  contextType: ChatContextType;
  isEmbedded: boolean;
}): boolean {
  const { contextType, isEmbedded } = params;
  return contextType === 'GAME' || !isEmbedded;
}

export function shouldDenyArchivedGameChatRouteOnMessageError(params: {
  status?: number;
  isGameChatArchived: boolean;
}): boolean {
  const { status, isGameChatArchived } = params;
  return status === 403 && isGameChatArchived;
}
