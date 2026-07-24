import { mediaApi } from '@/api/media';
import type { ChatContextType } from '@/api/chat';

const DEFAULT_ATTEMPTS = 3;

export async function uploadChatDocumentFileWithRetry(
  documentFile: File,
  contextId: string,
  contextType: ChatContextType,
  maxAttempts = DEFAULT_ATTEMPTS,
  signal?: AbortSignal
) {
  let last: unknown;
  for (let a = 1; a <= maxAttempts; a++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await mediaApi.uploadChatDocument(documentFile, contextId, contextType, { signal });
    } catch (e) {
      last = e;
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (a < maxAttempts) await new Promise((r) => setTimeout(r, 500 * a));
    }
  }
  throw last instanceof Error ? last : new Error('Document upload failed');
}
