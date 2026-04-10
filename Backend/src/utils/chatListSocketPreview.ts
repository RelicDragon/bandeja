import { ChatContextType } from '@prisma/client';

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
  if (ct !== ChatContextType.USER && ct !== ChatContextType.GROUP) return undefined;

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

  return {
    id: m.id,
    chatContextType: m.chatContextType,
    contextId: m.contextId,
    senderId: m.senderId,
    content: m.content ?? null,
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
