import { ChatContextType, ChatType } from '@prisma/client';
import { extractPreviewFromMessage } from '../services/chat/lastMessagePreview.service';

function pick<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) out[String(k)] = obj[k];
  }
  return out;
}

/** Slim payload for `chat:unread-count` so list rows can update without refetch. */
export function lastMessageForUnreadListSocket(message: unknown): Record<string, unknown> | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const m = message as Record<string, unknown>;
  const ct = m.chatContextType as ChatContextType | undefined;
  if (ct !== ChatContextType.USER && ct !== ChatContextType.GROUP && ct !== ChatContextType.GAME) {
    return undefined;
  }
  if (ct === ChatContextType.GAME && m.chatType !== ChatType.PUBLIC) {
    return undefined;
  }

  const sender = m.sender;
  const senderMinimal =
    sender && typeof sender === 'object'
      ? pick(sender as Record<string, unknown>, [
          'id',
          'firstName',
          'lastName',
          'avatar',
          'level',
          'gender',
        ])
      : null;

  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d);

  const content = m.content ?? null;
  const mediaUrls = Array.isArray(m.mediaUrls) ? m.mediaUrls : [];
  const preview =
    ct === ChatContextType.GAME
      ? extractPreviewFromMessage({
          content: typeof content === 'string' ? content : null,
          mediaUrls: mediaUrls as string[],
          pollId: (m.pollId as string | null) ?? null,
          messageType: m.messageType as string | undefined,
          audioDurationMs: (m.audioDurationMs as number | null) ?? null,
          videoDurationMs: (m.videoDurationMs as number | null) ?? null,
        })
      : null;

  return {
    id: m.id,
    chatContextType: m.chatContextType,
    contextId: m.contextId,
    senderId: m.senderId,
    content,
    preview,
    mediaUrls: Array.isArray(m.mediaUrls) ? m.mediaUrls : [],
    thumbnailUrls: Array.isArray(m.thumbnailUrls) ? m.thumbnailUrls : [],
    mentionIds: Array.isArray(m.mentionIds) ? m.mentionIds : [],
    state: m.state,
    chatType: m.chatType,
    messageType: m.messageType,
    audioDurationMs: m.audioDurationMs ?? null,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
    editedAt: m.editedAt != null ? iso(m.editedAt) : null,
    replyToId: m.replyToId ?? null,
    sender: senderMinimal,
    translation: m.translation,
  };
}
