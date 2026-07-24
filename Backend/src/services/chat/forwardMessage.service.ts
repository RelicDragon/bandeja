import {
  ChatContextType,
  MessageType,
  type ChatMessage,
  type ChatType,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export const FORWARDABLE_MESSAGE_TYPES = new Set<MessageType>([
  MessageType.TEXT,
  MessageType.IMAGE,
  MessageType.STICKER,
  MessageType.VIDEO,
  MessageType.DOCUMENT,
]);

export type ForwardedFromSnapshot = {
  title: string;
  chatContextType: ChatContextType;
  contextId: string;
  isChannel?: boolean;
  /** Present for GAME sources so clients open the correct PUBLIC/PRIVATE/ADMINS thread. */
  chatType?: ChatType;
  messageId: string;
};

export type ForwardCreateFields = {
  sourceAccess: {
    chatContextType: ChatContextType;
    contextId: string;
    chatType: ChatType;
  };
  /** Stable link target (root when nested); may equal the selected message. */
  forwardedFromMessageId: string;
  forwardedFrom: ForwardedFromSnapshot;
  content: string | null;
  mediaUrls: string[];
  thumbnailUrls: string[];
  messageType: MessageType;
  stickerId: string | null;
  stickerEmoji: string | null;
  videoDurationMs: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  documentFileName: string | null;
  documentMimeType: string | null;
  documentSize: number | null;
  linkPreview: unknown;
  linkPreviewUrl: string | null;
  linkPreviewDisabled: boolean;
};

function displayName(user: {
  firstName?: string | null;
  lastName?: string | null;
} | null): string {
  if (!user) return 'Unknown';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || 'Unknown';
}

export function parseForwardedFrom(raw: unknown): ForwardedFromSnapshot | null {
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

async function buildAttributionTitle(
  source: ChatMessage & {
    sender: { firstName: string | null; lastName: string | null } | null;
  }
): Promise<{ title: string; isChannel?: boolean }> {
  if (source.chatContextType === ChatContextType.GROUP) {
    const channel = await prisma.groupChannel.findUnique({
      where: { id: source.contextId },
      select: { name: true, isChannel: true },
    });
    if (channel?.isChannel) {
      return { title: channel.name?.trim() || 'Channel', isChannel: true };
    }
    return { title: displayName(source.sender), isChannel: false };
  }
  return { title: displayName(source.sender) };
}

/**
 * Resolve create fields from the **selected** (visible) message id.
 * Content/media/access come from that row. Attribution / FK prefer the root
 * forward chain when present so nested re-forwards keep the original title.
 */
export async function resolveForwardCreateFields(
  selectedMessageId: string
): Promise<ForwardCreateFields> {
  const id = selectedMessageId.trim();
  if (!id) {
    throw new ApiError(400, 'forwardedFromMessageId is required', true, {
      code: 'chat.forward.idRequired',
    });
  }

  const source = await prisma.chatMessage.findFirst({
    where: { id, deletedAt: null },
    include: {
      sender: { select: { firstName: true, lastName: true } },
    },
  });

  if (!source) {
    throw new ApiError(404, 'Original message not found', true, {
      code: 'chat.forward.notFound',
    });
  }

  if (!source.senderId) {
    throw new ApiError(400, 'System messages cannot be forwarded', true, {
      code: 'chat.forward.system',
    });
  }

  if (!FORWARDABLE_MESSAGE_TYPES.has(source.messageType)) {
    throw new ApiError(400, 'This message type cannot be forwarded', true, {
      code: 'chat.forward.typeNotAllowed',
    });
  }

  const existingSnap = parseForwardedFrom(source.forwardedFrom);
  let snapshot: ForwardedFromSnapshot;
  if (existingSnap) {
    snapshot = existingSnap;
    // Enrich pre-chatType snapshots so tap opens the correct game thread.
    if (snapshot.chatContextType === ChatContextType.GAME && !snapshot.chatType) {
      const root = await prisma.chatMessage.findFirst({
        where: { id: snapshot.messageId },
        select: { chatType: true },
      });
      if (root) {
        snapshot = { ...snapshot, chatType: root.chatType };
      }
    }
  } else {
    const { title, isChannel } = await buildAttributionTitle(source);
    snapshot = {
      title,
      chatContextType: source.chatContextType,
      contextId: source.contextId,
      messageId: source.id,
      ...(isChannel != null ? { isChannel } : {}),
      ...(source.chatContextType === ChatContextType.GAME
        ? { chatType: source.chatType }
        : {}),
    };
  }

  let linkId = source.forwardedFromMessageId?.trim() || source.id;
  if (linkId !== source.id) {
    const rootExists = await prisma.chatMessage.findFirst({
      where: { id: linkId },
      select: { id: true },
    });
    if (!rootExists) linkId = source.id;
  }

  return {
    sourceAccess: {
      chatContextType: source.chatContextType,
      contextId: source.contextId,
      chatType: source.chatType,
    },
    forwardedFromMessageId: linkId,
    forwardedFrom: snapshot,
    content: source.content,
    mediaUrls: [...(source.mediaUrls ?? [])],
    thumbnailUrls: [...(source.thumbnailUrls ?? [])],
    messageType: source.messageType,
    stickerId: source.stickerId,
    stickerEmoji: source.stickerEmoji,
    videoDurationMs: source.videoDurationMs,
    videoWidth: source.videoWidth,
    videoHeight: source.videoHeight,
    documentFileName: source.documentFileName,
    documentMimeType: source.documentMimeType,
    documentSize: source.documentSize,
    linkPreview: source.linkPreview,
    linkPreviewUrl: source.linkPreviewUrl,
    linkPreviewDisabled: source.linkPreviewDisabled,
  };
}

/**
 * URLs from `candidates` that are still used by at least one other live message.
 * Per-URL existence checks — correct even when many messages share media.
 */
export async function findReferencedChatMediaUrls(
  candidates: string[],
  excludeMessageId: string
): Promise<Set<string>> {
  const unique = [...new Set(candidates.filter((u) => typeof u === 'string' && u.length > 0))];
  if (unique.length === 0) return new Set();

  const referenced = new Set<string>();
  await Promise.all(
    unique.map(async (url) => {
      const hit = await prisma.chatMessage.findFirst({
        where: {
          id: { not: excludeMessageId },
          deletedAt: null,
          OR: [{ mediaUrls: { has: url } }, { thumbnailUrls: { has: url } }],
        },
        select: { id: true },
      });
      if (hit) referenced.add(url);
    })
  );
  return referenced;
}
