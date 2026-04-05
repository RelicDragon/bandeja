import type { ChatContextType } from '@/api/chat';
import { mediaApi } from '@/api/media';

const DEFAULT_ATTEMPTS = 3;

export async function uploadChatImageFileWithRetry(
  file: File,
  contextId: string,
  contextType: ChatContextType,
  maxAttempts = DEFAULT_ATTEMPTS
): Promise<{ originalUrl: string; thumbnailUrl: string }> {
  let last: unknown;
  for (let a = 1; a <= maxAttempts; a++) {
    try {
      const response = await mediaApi.uploadChatImage(file, contextId, contextType);
      return { originalUrl: response.originalUrl, thumbnailUrl: response.thumbnailUrl };
    } catch (e) {
      last = e;
      if (a < maxAttempts) await new Promise((r) => setTimeout(r, 350 * a));
    }
  }
  throw last instanceof Error ? last : new Error('Upload failed');
}
