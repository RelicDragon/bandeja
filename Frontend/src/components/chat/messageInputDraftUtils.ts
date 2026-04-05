import type { ChatDraft } from '@/api/chat';

export const isValidImage = (file: File): boolean => {
  return file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024;
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
