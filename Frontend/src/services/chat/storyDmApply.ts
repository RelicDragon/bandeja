import type { ChatMessage, StoryReplyInfo } from '@/api/chat';
import type { BasicUser } from '@/types';
import { putLocalMessage } from '@/services/chat/chatLocalApplyWrite';

export const STORY_DM_SENT_EVENT = 'chat:story-dm-sent';
export const STORY_DM_OPTIMISTIC_EVENT = 'chat:story-dm-optimistic';
export const STORY_DM_OPTIMISTIC_FAILED_EVENT = 'chat:story-dm-optimistic-failed';

export type StoryDmOptimisticDetail = {
  tempId: string;
  clientMutationId: string;
  contextId: string;
  content: string;
  storyReply: StoryReplyInfo;
  sender: BasicUser;
  createdAt: string;
};

export function dispatchStoryDmOptimistic(detail: StoryDmOptimisticDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STORY_DM_OPTIMISTIC_EVENT, { detail }));
}

export function dispatchStoryDmOptimisticFailed(
  contextId: string,
  tempId: string
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(STORY_DM_OPTIMISTIC_FAILED_EVENT, {
      detail: { contextType: 'USER', contextId, tempId },
    })
  );
}

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
