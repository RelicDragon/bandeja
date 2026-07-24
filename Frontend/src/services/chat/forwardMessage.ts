import {
  type ChatContextType,
  type ChatMessage,
  type ForwardedFromInfo,
  type OptimisticMessagePayload,
} from '@/api/chat';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout } from '@/services/chatSendService';
import { chatLocalDb } from '@/services/chat/chatLocalDb';
import type { ChatOutboxRow } from '@/services/chat/chatLocalDb';
import { getUserDisplayName } from '@/utils/messageMenuUtils';

/** Message types that can be forwarded (Telegram-style link to original). */
export const FORWARDABLE_MESSAGE_TYPES = new Set([
  'TEXT',
  'IMAGE',
  'STICKER',
  'VIDEO',
  'DOCUMENT',
]);

/** Can this message be forwarded? Excludes system, voice, and poll messages. */
export function isForwardableMessage(
  message: Pick<ChatMessage, 'messageType' | 'senderId'>
): boolean {
  if (!message.senderId) return false;
  return FORWARDABLE_MESSAGE_TYPES.has(message.messageType ?? 'TEXT');
}

export function parseForwardedFrom(raw: unknown): ForwardedFromInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const chatContextType = o.chatContextType;
  const contextId = typeof o.contextId === 'string' ? o.contextId : '';
  const messageId = typeof o.messageId === 'string' ? o.messageId : '';
  if (
    !title ||
    !contextId ||
    !messageId ||
    (chatContextType !== 'GAME' &&
      chatContextType !== 'USER' &&
      chatContextType !== 'GROUP' &&
      chatContextType !== 'BUG')
  ) {
    return null;
  }
  const chatType =
    o.chatType === 'PUBLIC' || o.chatType === 'PRIVATE' || o.chatType === 'ADMINS'
      ? o.chatType
      : undefined;
  return {
    title,
    chatContextType,
    contextId,
    messageId,
    ...(typeof o.isChannel === 'boolean' ? { isChannel: o.isChannel } : {}),
    ...(chatType ? { chatType } : {}),
  };
}

function senderTitle(message: ChatMessage): string {
  if (!message.sender) return 'Unknown';
  return getUserDisplayName(message.sender) || 'Unknown';
}

async function lookupGroupChannelMeta(
  contextId: string
): Promise<{ name: string; isChannel: boolean } | null> {
  try {
    const rows = await chatLocalDb.threadIndex
      .where('[contextType+contextId]')
      .equals(['GROUP', contextId])
      .toArray();
    for (const row of rows) {
      if (row.itemType !== 'group' && row.itemType !== 'channel') continue;
      const parsed = JSON.parse(row.itemJson) as {
        data?: { name?: string; isChannel?: boolean };
      };
      const name = parsed?.data?.name?.trim() ?? '';
      const isChannel =
        row.itemType === 'channel' || parsed?.data?.isChannel === true;
      if (name || isChannel) {
        return { name: name || (isChannel ? 'Channel' : 'Group'), isChannel };
      }
    }
  } catch {
    /* ignore corrupt index rows */
  }
  return null;
}

/**
 * Attribution for a forward. Nested forwards keep the root title/source chat.
 * Channels use channel name + isChannel (matches server).
 */
export async function buildForwardedFromInfo(
  message: ChatMessage
): Promise<ForwardedFromInfo> {
  const existing = parseForwardedFrom(message.forwardedFrom);
  if (existing) return existing;

  if (message.chatContextType === 'GROUP') {
    const meta = await lookupGroupChannelMeta(message.contextId);
    if (meta?.isChannel) {
      return {
        title: meta.name,
        chatContextType: message.chatContextType,
        contextId: message.contextId,
        messageId: message.id,
        isChannel: true,
      };
    }
  }

  return {
    title: senderTitle(message),
    chatContextType: message.chatContextType,
    contextId: message.contextId,
    messageId: message.id,
    ...(message.chatContextType === 'GAME' && message.chatType
      ? { chatType: message.chatType }
      : {}),
  };
}

/**
 * Build the send payload for a forward.
 * `forwardedFromMessageId` is always the **selected** message id — server copies
 * that row’s content/media (no CDN re-upload) and resolves root attribution.
 */
export async function buildForwardPayload(
  message: ChatMessage
): Promise<{
  payload: OptimisticMessagePayload;
  mediaUrls: string[];
  thumbnailUrls: string[];
} | null> {
  if (!isForwardableMessage(message)) return null;

  const forwardedFrom = await buildForwardedFromInfo(message);
  // Selected bubble id — never jump to root for content (nested-forward safe).
  const forwardedFromMessageId = message.id;

  const mediaUrls = Array.isArray(message.mediaUrls) ? [...message.mediaUrls] : [];
  const thumbnailUrls = Array.isArray(message.thumbnailUrls)
    ? [...message.thumbnailUrls]
    : [];

  const base = {
    chatType: 'PUBLIC' as const,
    mentionIds: [] as string[],
    forwardedFromMessageId,
    forwardedFrom,
  };

  if (message.messageType === 'STICKER') {
    return {
      payload: {
        ...base,
        content: '',
        mediaUrls: [],
        thumbnailUrls: [],
        messageType: 'STICKER',
        stickerId: message.stickerId ?? undefined,
        stickerEmoji: message.stickerEmoji ?? undefined,
      },
      mediaUrls: [],
      thumbnailUrls: [],
    };
  }

  if (message.messageType === 'VIDEO') {
    return {
      payload: {
        ...base,
        content: '',
        mediaUrls,
        thumbnailUrls,
        messageType: 'VIDEO',
        videoDurationMs: message.videoDurationMs ?? undefined,
        videoWidth: message.videoWidth ?? undefined,
        videoHeight: message.videoHeight ?? undefined,
      },
      mediaUrls,
      thumbnailUrls,
    };
  }

  if (message.messageType === 'DOCUMENT') {
    return {
      payload: {
        ...base,
        content: '',
        mediaUrls,
        thumbnailUrls: [],
        messageType: 'DOCUMENT',
        documentFileName: message.documentFileName ?? undefined,
        documentMimeType: message.documentMimeType ?? undefined,
        documentSize: message.documentSize ?? undefined,
      },
      mediaUrls,
      thumbnailUrls: [],
    };
  }

  return {
    payload: {
      ...base,
      content: message.content ?? '',
      mediaUrls,
      thumbnailUrls,
      messageType: message.messageType === 'IMAGE' ? 'IMAGE' : 'TEXT',
      linkPreview: message.linkPreview ?? undefined,
      linkPreviewUrl: message.linkPreviewUrl,
      linkPreviewDisabled: message.linkPreviewDisabled,
    },
    mediaUrls,
    thumbnailUrls,
  };
}

export type ForwardEnqueueResult = {
  ok: boolean;
  tempId?: string;
};

export type ForwardSendHooks = {
  onFailed?: () => void;
};

/**
 * Enqueue a forward and kick off send in the background (Telegram-style).
 * Resolves as soon as the outbox row is written so UI can navigate immediately.
 * Local media URLs are for optimistic paint only — API sends `forwardedFromMessageId`
 * and the server copies CDN URLs from the original.
 */
export async function forwardMessageToContext(
  message: ChatMessage,
  destContextType: ChatContextType,
  destContextId: string,
  hooks?: ForwardSendHooks
): Promise<ForwardEnqueueResult> {
  const built = await buildForwardPayload(message);
  if (!built) return { ok: false };
  const { payload, mediaUrls, thumbnailUrls } = built;

  const tempId = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const clientMutationId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;

  const row: ChatOutboxRow = {
    tempId,
    contextType: destContextType,
    contextId: destContextId,
    payload,
    createdAt: new Date().toISOString(),
    status: 'sending',
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
    clientMutationId,
  };

  try {
    await messageQueueStorage.add(row);
  } catch {
    return { ok: false };
  }

  // Fire-and-forget: outbox owns retries; surface hard failure to caller.
  sendWithTimeout(
    {
      tempId,
      contextType: destContextType,
      contextId: destContextId,
      payload,
      mediaUrls,
      thumbnailUrls,
      clientMutationId,
    },
    {
      onSuccess: () => undefined,
      onFailed: () => {
        hooks?.onFailed?.();
      },
    }
  );

  return { ok: true, tempId };
}
