import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import type { ChatContextType } from '@/api/chat';
import { isValidImage } from '@/components/chat/messageInputDraftUtils';
import { uploadChatImageFileWithRetry } from '@/services/chat/chatImageUploadRetry';

export class ChatImageBatchUploadError extends Error {
  readonly name = 'ChatImageBatchUploadError';
  constructor(public readonly failedIndices: number[]) {
    super('chat.imageUploadBatchFailed');
  }
}

export const uploadChatImageSlotWithRetry = uploadChatImageFileWithRetry;

export async function uploadChatImagesForMessage(
  files: File[],
  targetId: string | undefined,
  contextType: ChatContextType,
  t: TFunction
): Promise<{ originalUrls: string[]; thumbnailUrls: string[] }> {
  const valid = files.filter(isValidImage);
  if (valid.length === 0) return { originalUrls: [], thumbnailUrls: [] };
  if (!targetId) return { originalUrls: [], thumbnailUrls: [] };

  const settled = await Promise.all(
    valid.map((file, index) =>
      uploadChatImageFileWithRetry(file, targetId, contextType).then(
        (r) => ({ ok: true as const, index, ...r }),
        () => ({ ok: false as const, index })
      )
    )
  );

  const failedIndices = settled.filter((s) => !s.ok).map((s) => s.index);
  if (failedIndices.length > 0) {
    toast.error(
      t('chat.allImagesMustUpload', {
        defaultValue: 'Could not upload all images. Fix or retry each photo, then send again.',
      })
    );
    throw new ChatImageBatchUploadError(failedIndices);
  }

  const ok = settled.filter((s): s is { ok: true; index: number; originalUrl: string; thumbnailUrl: string } => s.ok);
  ok.sort((a, b) => a.index - b.index);
  return {
    originalUrls: ok.map((s) => s.originalUrl),
    thumbnailUrls: ok.map((s) => s.thumbnailUrl),
  };
}
