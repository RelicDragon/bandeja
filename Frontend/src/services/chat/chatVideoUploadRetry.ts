import { mediaApi } from '@/api/media';
import type { ChatContextType } from '@/api/chat';

const DEFAULT_ATTEMPTS = 3;

export async function uploadChatVideoFileWithRetry(
  videoFile: File,
  posterFile: File | undefined,
  contextId: string,
  contextType: ChatContextType,
  durationMs: number,
  width: number,
  height: number,
  maxAttempts = DEFAULT_ATTEMPTS,
  signal?: AbortSignal,
  onUploadProgress?: (progress: number) => void
) {
  let last: unknown;
  for (let a = 1; a <= maxAttempts; a++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await mediaApi.uploadChatVideo(videoFile, contextId, contextType, {
        signal,
        posterFile,
        durationMs,
        width,
        height,
        onUploadProgress,
      });
    } catch (e) {
      last = e;
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (a < maxAttempts) await new Promise((r) => setTimeout(r, 500 * a));
    }
  }
  throw last instanceof Error ? last : new Error('Video upload failed');
}
