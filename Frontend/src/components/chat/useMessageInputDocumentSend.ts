import type { TFunction } from 'i18next';
import type { ChatContextType, ChatMessage, OptimisticMessagePayload } from '@/api/chat';
import type { ChatType } from '@/types';
import type { PendingGiphyOutboxMedia } from '@/services/chat/chatLocalDb';
import { normalizeChatType } from '@/utils/chatType';
import { buildReplyToRef } from '@/utils/buildReplyToRef';
import { isValidChatDocument, MAX_CHAT_DOCUMENT_BYTES, mimeFromChatDocumentName } from '@/utils/documentCapture';
import toast from 'react-hot-toast';

type Params = {
  isDisabled: boolean;
  inputBlocked: boolean;
  finalContextId: string | undefined;
  contextType: ChatContextType;
  chatType: ChatType;
  replyTo?: ChatMessage | null;
  onOptimisticMessage?: (
    payload: OptimisticMessagePayload,
    pendingImageBlobs?: Blob[],
    pendingVoiceBlob?: Blob,
    pendingVideoBlob?: Blob,
    pendingVideoPosterBlob?: Blob,
    videoTranscodeMs?: number,
    pendingGiphy?: PendingGiphyOutboxMedia,
    pendingDocumentBlob?: Blob
  ) => string;
  onSendQueued?: (params: {
    tempId: string;
    contextType: ChatContextType;
    contextId: string;
    payload: OptimisticMessagePayload;
    mediaUrls?: string[];
    thumbnailUrls?: string[];
  }) => void;
  onMessageSent?: () => void;
  onCancelReply?: () => void;
  t: TFunction;
};

export function useMessageInputDocumentSend({
  isDisabled,
  inputBlocked,
  finalContextId,
  contextType,
  chatType,
  replyTo,
  onOptimisticMessage,
  onSendQueued,
  onMessageSent,
  onCancelReply,
  t,
}: Params) {
  const handleDocumentFile = (file: File) => {
    if (isDisabled || inputBlocked || !finalContextId || !onOptimisticMessage) return;
    if (!isValidChatDocument(file)) {
      if (file.size > MAX_CHAT_DOCUMENT_BYTES) {
        toast.error(t('chat.documentTooLarge', { defaultValue: 'File is too large (max 32 MB)' }));
      } else {
        toast.error(
          t('chat.invalidDocumentType', {
            defaultValue: 'Unsupported file type (PDF, DOC, DOCX, TXT)',
          })
        );
      }
      return;
    }

    const fileName = file.name || 'document';
    const mimeType =
      (file.type && file.type !== 'application/octet-stream'
        ? file.type
        : mimeFromChatDocumentName(fileName)) || 'application/octet-stream';
    const normalizedFile =
      file.type === mimeType
        ? file
        : new File([file], fileName, { type: mimeType, lastModified: file.lastModified });

    const payload: OptimisticMessagePayload = {
      content: '',
      mediaUrls: [URL.createObjectURL(normalizedFile)],
      thumbnailUrls: [],
      replyToId: replyTo?.id,
      replyTo: replyTo ? buildReplyToRef(replyTo) : undefined,
      chatType: normalizeChatType(chatType),
      mentionIds: [],
      messageType: 'DOCUMENT',
      documentFileName: fileName,
      documentMimeType: mimeType,
      documentSize: normalizedFile.size,
    };

    const tempId = onOptimisticMessage(
      payload,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      normalizedFile
    );
    onSendQueued?.({
      tempId,
      contextType,
      contextId: finalContextId,
      payload: {
        ...payload,
        mediaUrls: [],
        thumbnailUrls: [],
      },
      mediaUrls: [],
      thumbnailUrls: [],
    });
    onCancelReply?.();
    onMessageSent?.();
  };

  return { handleDocumentFile };
}
