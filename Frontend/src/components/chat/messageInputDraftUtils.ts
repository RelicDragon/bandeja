import type { ChatContextType, ChatDraft } from '@/api/chat';
import type { ChatType } from '@/types';

export const isValidImage = (file: File): boolean => {
  return file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024;
};

export const isValidVideo = (file: File): boolean => {
  if (!file.type.startsWith('video/')) return false;
  return file.size <= 200 * 1024 * 1024;
};

export const draftLoadingCache = new Map<string, Promise<ChatDraft | null>>();

export const SAVE_DRAFT_RETRIES = 3;
export const SAVE_DRAFT_RETRY_MS = 1200;
export const DRAFT_MAX_CONTENT_LENGTH = 10000;
export const TRANSLATE_DRAFT_MAX_LENGTH = 4000;

export function isRetryableDraftError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const err = error as { response?: { status?: number }; code?: string };
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
  const status = err.response?.status;
  if (status == null) return true;
  if (status >= 500 || status === 408 || status === 429) return true;
  return false;
}

export async function withDraftRetry<T>(fn: () => Promise<T>, retries = SAVE_DRAFT_RETRIES): Promise<T> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < retries - 1 && isRetryableDraftError(e)) {
        await new Promise((r) => setTimeout(r, SAVE_DRAFT_RETRY_MS));
      } else {
        throw last;
      }
    }
  }
  throw last;
}

export function emitDraftUpdatedEvent(
  userId: string,
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  content: string,
  mentionIds: string[]
): void {
  const trimmedContent = (content?.trim() ?? '').slice(0, DRAFT_MAX_CONTENT_LENGTH);
  const safeMentionIds = (mentionIds ?? []).slice(0, 50);
  const now = new Date().toISOString();
  window.dispatchEvent(
    new CustomEvent('draft-updated', {
      detail: {
        draft: {
          id: `local-${contextType}-${contextId}-${chatType}`,
          userId,
          chatContextType: contextType,
          contextId,
          chatType,
          content: trimmedContent,
          mentionIds: safeMentionIds,
          updatedAt: now,
          createdAt: now,
        } satisfies ChatDraft,
        chatContextType: contextType,
        contextId,
      },
    })
  );
}
