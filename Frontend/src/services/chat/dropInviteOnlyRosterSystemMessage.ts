import { getGameChatSyncContext } from '@/services/chat/resolveGameChatSyncTypes';
import { shouldHideRosterLifecycleForGameViewer } from '@/utils/gameChatRosterVisibility';

export function shouldDropInviteOnlyRosterSystemMessage(message: {
  chatContextType?: string;
  contextId?: string;
  senderId?: string | null;
  content?: string | null;
}): boolean {
  if (message.chatContextType !== 'GAME' || !message.contextId) return false;
  const status = getGameChatSyncContext(message.contextId)?.participant?.status;
  return shouldHideRosterLifecycleForGameViewer(status, message);
}
