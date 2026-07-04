import { chatApi, type ChatContextType, type ChatType } from '@/api/chat';
import { draftStorage } from '@/services/draftStorage';
import { emitDraftUpdatedEvent, withDraftRetry } from './messageInputDraftUtils';

type DraftSnapshot = {
  content: string;
  mentionIds: string[];
};

export async function deleteDraftFromComposer(params: {
  userId: string;
  contextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  previousDraft: DraftSnapshot | null;
}): Promise<void> {
  const { userId, contextType, contextId, chatType, previousDraft } = params;

  try {
    await withDraftRetry(() => chatApi.deleteDraft(contextType, contextId, chatType));
    await draftStorage.remove(userId, contextType, contextId, chatType);
    window.dispatchEvent(
      new CustomEvent('draft-deleted', {
        detail: { chatContextType: contextType, contextId, chatType },
      })
    );
  } catch (error) {
    if (previousDraft && (previousDraft.content.trim().length > 0 || previousDraft.mentionIds.length > 0)) {
      await draftStorage.set(
        userId,
        contextType,
        contextId,
        chatType,
        previousDraft.content,
        previousDraft.mentionIds
      );
      emitDraftUpdatedEvent(
        userId,
        contextType,
        contextId,
        chatType,
        previousDraft.content,
        previousDraft.mentionIds
      );
    }
    throw error;
  }
}
