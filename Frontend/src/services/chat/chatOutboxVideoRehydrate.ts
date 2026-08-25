import { createFallbackChatVideoPosterBlob } from '@/services/chat/chatVideoPoster';
import {
  loadOutboxVideoBlob,
  loadOutboxVideoPosterBlob,
} from '@/services/chat/chatOutboxMediaBlobs';

/** Blob URLs for pending video outbox preview; poster is optional (server accepts upload without it). */
export async function loadOutboxVideoPreviewUrls(
  tempId: string
): Promise<{ mediaUrls: string[]; thumbnailUrls: string[] } | null> {
  const vb = await loadOutboxVideoBlob(tempId);
  if (!vb) return null;
  const pb = await loadOutboxVideoPosterBlob(tempId);
  return {
    mediaUrls: [URL.createObjectURL(vb)],
    thumbnailUrls: [URL.createObjectURL(pb ?? createFallbackChatVideoPosterBlob())],
  };
}
