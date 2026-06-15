export type PushChatContext = {
  type: string;
  chatContextType: string;
  contextId: string;
  messageId: string;
  chatType?: string;
  replyToken?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  gameId?: string;
  userChatId?: string;
  groupChannelId?: string;
  bugId?: string;
  marketItemId?: string;
  userId?: string;
};

const CHAT_NOTIFICATION_TYPES = new Set([
  'USER_CHAT',
  'GAME_CHAT',
  'GROUP_CHAT',
  'BUG_CHAT',
]);

function readString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function flattenPayload(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    return { ...(raw.data as Record<string, unknown>) };
  }
  const { type: _type, ...rest } = raw;
  return rest;
}

function inferFromLegacyFields(
  type: string,
  flat: Record<string, unknown>
): Pick<PushChatContext, 'chatContextType' | 'contextId'> | null {
  const explicitContextType = readString(flat, 'chatContextType');
  const explicitContextId = readString(flat, 'contextId');
  if (explicitContextType && explicitContextId) {
    return { chatContextType: explicitContextType, contextId: explicitContextId };
  }

  switch (type) {
    case 'USER_CHAT': {
      const userChatId = readString(flat, 'userChatId');
      return userChatId ? { chatContextType: 'USER', contextId: userChatId } : null;
    }
    case 'GAME_CHAT': {
      const gameId = readString(flat, 'gameId');
      return gameId ? { chatContextType: 'GAME', contextId: gameId } : null;
    }
    case 'GROUP_CHAT': {
      const groupChannelId = readString(flat, 'groupChannelId');
      return groupChannelId ? { chatContextType: 'GROUP', contextId: groupChannelId } : null;
    }
    case 'BUG_CHAT': {
      const bugId = readString(flat, 'bugId');
      return bugId ? { chatContextType: 'BUG', contextId: bugId } : null;
    }
    default:
      return null;
  }
}

function isStoryEngagementPayload(flat: Record<string, unknown>): boolean {
  return Boolean(readString(flat, 'sourceType') && readString(flat, 'sourceId'));
}

export function parsePushChatContext(raw: unknown): PushChatContext | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const type = readString(record, 'type') ?? readString(flattenPayload(record), 'type');
  if (!type || !CHAT_NOTIFICATION_TYPES.has(type)) return null;

  const flat = flattenPayload(record);
  if (isStoryEngagementPayload(flat)) return null;

  const messageId = readString(flat, 'messageId');
  if (!messageId) return null;

  const inferred = inferFromLegacyFields(type, flat);
  if (!inferred) return null;

  const ctx: PushChatContext = {
    type,
    chatContextType: inferred.chatContextType,
    contextId: inferred.contextId,
    messageId,
    chatType: readString(flat, 'chatType'),
    replyToken: readString(flat, 'replyToken'),
    senderName: readString(flat, 'senderName'),
    senderAvatarUrl: readString(flat, 'senderAvatarUrl'),
    gameId: readString(flat, 'gameId'),
    userChatId: readString(flat, 'userChatId'),
    groupChannelId: readString(flat, 'groupChannelId'),
    bugId: readString(flat, 'bugId'),
    marketItemId: readString(flat, 'marketItemId'),
    userId: readString(flat, 'userId'),
  };

  return ctx;
}
