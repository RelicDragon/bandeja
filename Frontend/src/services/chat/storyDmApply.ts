import type { ChatMessage } from '@/api/chat';
import { putLocalMessage } from '@/services/chat/chatLocalApplyWrite';

export const STORY_DM_SENT_EVENT = 'chat:story-dm-sent';

export async function applyStoryDmSentMessage(message: ChatMessage): Promise<void> {
  await putLocalMessage(message);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(STORY_DM_SENT_EVENT, {
      detail: {
        message,
        contextType: message.chatContextType,
        contextId: message.contextId,
      },
    })
  );
}
