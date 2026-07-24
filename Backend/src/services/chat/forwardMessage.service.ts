import {
  ChatContextType,
  MessageType,
  Prisma,
  type ChatMessage,
  type ChatType,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { isAllowedGiphyHost } from '../giphyIngest/giphyHosts';

export const FORWARDABLE_MESSAGE_TYPES = new Set<MessageType>([
  MessageType.TEXT,
  MessageType.IMAGE,
  MessageType.STICKER,
  MessageType.VIDEO,
  MessageType.DOCUMENT,
  MessageType.VOICE,
  MessageType.POLL,
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
  audioDurationMs: number | null;
  waveformData: number[];
  videoDurationMs: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  documentFileName: string | null;
  documentMimeType: string | null;
  documentSize: number | null;
  linkPreview: unknown;
  linkPreviewUrl: string | null;
  linkPreviewDisabled: boolean;
  /** Present when linking a poll — never create a new Poll row for forwards. */
  linkedPollQuestion: string | null;
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

/** Reject provider-CDN GIF URLs — forwards must use app-hosted media only. */
export function assertForwardMediaUrlsAllowed(urls: readonly string[]): void {
  for (const raw of urls) {
    const u = raw?.trim();
    if (!u) continue;
    try {
      const host = new URL(u).hostname;
      if (isAllowedGiphyHost(host)) {
        throw new ApiError(400, 'Provider-hosted GIFs cannot be forwarded', true, {
          code: 'chat.forward.providerMedia',
        });
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }
  }
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
      poll: { select: { question: true } },
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

  assertForwardMediaUrlsAllowed([...(source.mediaUrls ?? []), ...(source.thumbnailUrls ?? [])]);

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

  // Poll shells have no Poll row — resolve question from the linked root host.
  let linkedPollQuestion: string | null = null;
  if (source.messageType === MessageType.POLL) {
    linkedPollQuestion = source.poll?.question ?? null;
    if (!linkedPollQuestion) {
      const rootPoll = await prisma.poll.findUnique({
        where: { messageId: linkId },
        select: { question: true },
      });
      linkedPollQuestion = rootPoll?.question ?? null;
    }
    if (!linkedPollQuestion) {
      throw new ApiError(400, 'Poll message is missing poll data', true, {
        code: 'chat.forward.pollMissing',
      });
    }
  }

  return {
    sourceAccess: {
      chatContextType: source.chatContextType,
      contextId: source.contextId,
      chatType: source.chatType,
    },
    forwardedFromMessageId: linkId,
    forwardedFrom: snapshot,
    content:
      source.messageType === MessageType.POLL
        ? linkedPollQuestion ?? source.content
        : source.content,
    mediaUrls: [...(source.mediaUrls ?? [])],
    thumbnailUrls: [...(source.thumbnailUrls ?? [])],
    messageType: source.messageType,
    stickerId: source.stickerId,
    stickerEmoji: source.stickerEmoji,
    audioDurationMs: source.audioDurationMs,
    waveformData: Array.isArray(source.waveformData) ? [...source.waveformData] : [],
    videoDurationMs: source.videoDurationMs,
    videoWidth: source.videoWidth,
    videoHeight: source.videoHeight,
    documentFileName: source.documentFileName,
    documentMimeType: source.documentMimeType,
    documentSize: source.documentSize,
    linkPreview: source.linkPreview,
    linkPreviewUrl: source.linkPreviewUrl,
    linkPreviewDisabled: source.linkPreviewDisabled,
    linkedPollQuestion,
  };
}

const FORWARD_BODY_FIELDS = [
  'content',
  'mediaUrls',
  'thumbnailUrls',
  'messageType',
  'stickerId',
  'stickerEmoji',
  'audioDurationMs',
  'waveformData',
  'videoDurationMs',
  'videoWidth',
  'videoHeight',
  'documentFileName',
  'documentMimeType',
  'documentSize',
  'linkPreview',
  'linkPreviewUrl',
  'linkPreviewDisabled',
] as const;

/**
 * Overlay live body + poll from the linked original onto forward rows.
 * Keeps the forward row’s identity (id, sender, reactions, attribution).
 */
export async function hydrateForwardedMessages<T extends Record<string, unknown>>(
  messages: T[]
): Promise<T[]> {
  const linkIds = [
    ...new Set(
      messages
        .map((m) =>
          typeof m.forwardedFromMessageId === 'string' ? m.forwardedFromMessageId.trim() : ''
        )
        .filter(Boolean)
    ),
  ];
  if (linkIds.length === 0) return messages;

  const originals = await prisma.chatMessage.findMany({
    where: { id: { in: linkIds } },
    include: {
      poll: {
        include: {
          options: {
            include: {
              votes: {
                include: {
                  user: { select: USER_SELECT_WITH_SPORT_PROFILES },
                },
              },
            },
            orderBy: { order: 'asc' },
          },
          votes: {
            include: {
              user: { select: USER_SELECT_WITH_SPORT_PROFILES },
            },
          },
        },
      },
      audioTranscription: true,
    },
  });
  const byId = new Map(originals.map((o) => [o.id, o]));

  return messages.map((m) => {
    const linkId =
      typeof m.forwardedFromMessageId === 'string' ? m.forwardedFromMessageId.trim() : '';
    if (!linkId) return m;
    const orig = byId.get(linkId);
    if (!orig) return m;

    const next: Record<string, unknown> = { ...m };
    // Soft-deleted host: still share poll + transcription so linked forwards keep working.
    if (!orig.deletedAt) {
      for (const key of FORWARD_BODY_FIELDS) {
        if (key in orig) next[key] = (orig as Record<string, unknown>)[key];
      }
    }
    next.poll = orig.poll ?? null;
    if (orig.audioTranscription) {
      next.audioTranscription = orig.audioTranscription;
    }
    return next as T;
  });
}

/**
 * Root message id for linked forwards (transcription / shared media identity).
 */
export function resolveLinkedRootMessageId(message: {
  id: string;
  forwardedFromMessageId?: string | null;
}): string {
  const root = message.forwardedFromMessageId?.trim();
  return root || message.id;
}

/**
 * Live forward shells that point at `rootMessageId` (for poll vote fan-out / access).
 */
export async function findLiveForwardsOfMessage(rootMessageId: string): Promise<
  Array<{
    id: string;
    chatContextType: ChatContextType;
    contextId: string;
    chatType: ChatType;
  }>
> {
  if (!rootMessageId) return [];
  return prisma.chatMessage.findMany({
    where: {
      forwardedFromMessageId: rootMessageId,
      deletedAt: null,
    },
    select: {
      id: true,
      chatContextType: true,
      contextId: true,
      chatType: true,
    },
  });
}

/**
 * URLs from `candidates` that are still used by at least one other live message.
 * Per-URL existence checks — correct even when many messages share media.
 */
export async function findReferencedChatMediaUrls(
  candidates: string[],
  excludeMessageIds: string | string[]
): Promise<Set<string>> {
  const unique = [...new Set(candidates.filter((u) => typeof u === 'string' && u.length > 0))];
  if (unique.length === 0) return new Set();
  const excluded = [
    ...new Set(
      (Array.isArray(excludeMessageIds) ? excludeMessageIds : [excludeMessageIds]).filter(Boolean)
    ),
  ];

  const referenced = new Set<string>();
  await Promise.all(
    unique.map(async (url) => {
      const hit = await prisma.chatMessage.findFirst({
        where: {
          ...(excluded.length === 1
            ? { id: { not: excluded[0]! } }
            : excluded.length > 1
              ? { id: { notIn: excluded } }
              : {}),
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

/**
 * Before hard-deleting messages (admin user/game cascade), rehome Poll +
 * transcription onto a surviving live forward shell and retarget
 * `forwardedFromMessageId` links. Soft-delete already keeps hosts; hard-delete
 * would otherwise Cascade-delete Poll and SetNull the FK.
 */
export async function rehomeForwardHostsBeforeHardDelete(
  dyingMessageIds: string[],
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const dying = [...new Set(dyingMessageIds.filter(Boolean))];
  if (dying.length === 0) return;

  const survivorForwards = await db.chatMessage.findMany({
    where: {
      forwardedFromMessageId: { in: dying },
      deletedAt: null,
      id: { notIn: dying },
    },
    select: { id: true, forwardedFromMessageId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (survivorForwards.length === 0) return;

  const byHost = new Map<string, typeof survivorForwards>();
  for (const row of survivorForwards) {
    const hostId = row.forwardedFromMessageId?.trim();
    if (!hostId) continue;
    const list = byHost.get(hostId);
    if (list) list.push(row);
    else byHost.set(hostId, [row]);
  }

  for (const [hostId, survivors] of byHost) {
    const newHostId = survivors[0]?.id;
    if (!newHostId) continue;

    const run = async (tx: Prisma.TransactionClient) => {
      const newHost = await tx.chatMessage.findUnique({
        where: { id: newHostId },
        select: { senderId: true },
      });
      await tx.chatMessage.update({
        where: { id: newHostId },
        data: { forwardedFromMessageId: null, forwardedFrom: Prisma.DbNull },
      });

      const poll = await tx.poll.findUnique({ where: { messageId: hostId }, select: { id: true } });
      if (poll) {
        await tx.poll.update({
          where: { id: poll.id },
          data: { messageId: newHostId },
        });
      }

      const transcription = await tx.messageTranscription.findUnique({
        where: { messageId: hostId },
        select: { id: true },
      });
      if (transcription) {
        const existingOnNew = await tx.messageTranscription.findUnique({
          where: { messageId: newHostId },
          select: { id: true },
        });
        if (existingOnNew) {
          await tx.messageTranscription.delete({ where: { id: transcription.id } });
        } else {
          // Retarget createdBy so user.delete Cascade on the dying author
          // does not wipe the shared transcription after rehome.
          await tx.messageTranscription.update({
            where: { id: transcription.id },
            data: {
              messageId: newHostId,
              ...(newHost?.senderId ? { createdBy: newHost.senderId } : {}),
            },
          });
        }
      }

      await tx.chatMessage.updateMany({
        where: {
          forwardedFromMessageId: hostId,
          deletedAt: null,
          id: { not: newHostId },
        },
        data: { forwardedFromMessageId: newHostId },
      });
    };

    if (db === prisma) {
      await prisma.$transaction(run);
    } else {
      await run(db);
    }
  }
}
