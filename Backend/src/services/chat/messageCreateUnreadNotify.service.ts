import type { ChatContextType } from '@prisma/client';
import prisma from '../../config/database';
import { lookupBugGroupChannelIds } from './bugGroupChannelLookup';
import { ReadReceiptService } from './readReceipt.service';
import { UnreadAuthority } from './unreadAuthority';
import type { UnreadChangeReason, UnreadCountAdapter } from './unreadAuthority/types';
import type { ContextKey, GroupChannelMeta, SnapshotContextType } from './unreadSnapshot.service';
import { toContextKey } from './unreadSnapshot.service';

export type ContextUnreadAuthorityReason = Extract<
  UnreadChangeReason,
  'mark_context_read' | 'message_deleted'
>;

export type ResolvedMessageUnreadContext = {
  contextKey: ContextKey;
  contextType: SnapshotContextType;
  contextId: string;
  countAdapter?: UnreadCountAdapter;
  groupChannelMeta?: Partial<GroupChannelMeta>;
};

export type MessageCreateUnreadNotifyParams = {
  chatContextType: ChatContextType;
  contextId: string;
  senderId: string;
  recipientIds: string[];
  lastMessage?: Record<string, unknown>;
  bugGroupChannelId?: string | null;
};

export function resolveMessageUnreadContext(
  chatContextType: ChatContextType,
  contextId: string,
  bugGroupChannelId?: string | null
): ResolvedMessageUnreadContext | null {
  if (chatContextType === 'GAME') {
    return {
      contextKey: toContextKey('GAME', contextId),
      contextType: 'GAME',
      contextId,
    };
  }
  if (chatContextType === 'USER') {
    return {
      contextKey: toContextKey('USER', contextId),
      contextType: 'USER',
      contextId,
    };
  }
  if (chatContextType === 'GROUP') {
    return {
      contextKey: toContextKey('GROUP', contextId),
      contextType: 'GROUP',
      contextId,
    };
  }
  if (chatContextType === 'BUG') {
    if (!bugGroupChannelId) return null;
    return {
      contextKey: toContextKey('GROUP', bugGroupChannelId),
      contextType: 'GROUP',
      contextId: bugGroupChannelId,
      countAdapter: async (_contextType, _contextId, userId) =>
        ReadReceiptService.getUnreadCountForContext('BUG', contextId, userId),
      groupChannelMeta: { bugId: contextId, isChannel: false, marketItemId: null },
    };
  }
  return null;
}

export async function notifyRecipientsOnMessageCreate(
  params: MessageCreateUnreadNotifyParams
): Promise<void> {
  const resolved = resolveMessageUnreadContext(
    params.chatContextType,
    params.contextId,
    params.bugGroupChannelId
  );
  if (!resolved) return;

  const recipients = [
    ...new Set(
      params.recipientIds.filter(
        (id) => typeof id === 'string' && id.length > 0 && id !== params.senderId
      )
    ),
  ];
  if (recipients.length === 0) return;

  const lastMessage =
    params.lastMessage != null && Object.keys(params.lastMessage).length > 0
      ? params.lastMessage
      : undefined;

  await Promise.all(
    recipients.map((userId) =>
      UnreadAuthority.recordContextChanged({
        userId,
        contextKey: resolved.contextKey,
        contextType: resolved.contextType,
        contextId: resolved.contextId,
        reason: 'message_created',
        ...(resolved.countAdapter ? { countAdapter: resolved.countAdapter } : {}),
        ...(lastMessage ? { lastMessage } : {}),
        ...(resolved.groupChannelMeta ? { groupChannelMeta: resolved.groupChannelMeta } : {}),
      })
    )
  );
}

export function scheduleMessageCreateUnreadNotify(params: MessageCreateUnreadNotifyParams): void {
  queueMicrotask(() => {
    void notifyRecipientsOnMessageCreate(params).catch((error) => {
      console.error('[MessageCreateUnreadNotify] Failed after send:', error);
    });
  });
}

async function getViewerUserIdsForContext(
  chatContextType: ChatContextType,
  contextId: string
): Promise<string[]> {
  if (chatContextType === 'GAME') {
    const participants = await prisma.gameParticipant.findMany({
      where: { gameId: contextId },
      select: { userId: true },
    });
    return [...new Set(participants.map((p) => p.userId))];
  }

  if (chatContextType === 'USER') {
    const chat = await prisma.userChat.findUnique({
      where: { id: contextId },
      select: { user1Id: true, user2Id: true },
    });
    return chat ? [chat.user1Id, chat.user2Id] : [];
  }

  if (chatContextType === 'GROUP') {
    const participants = await prisma.groupChannelParticipant.findMany({
      where: { groupChannelId: contextId, hidden: false },
      select: { userId: true },
    });
    return [...new Set(participants.map((p) => p.userId))];
  }

  if (chatContextType === 'BUG') {
    const [bug, bugParticipants] = await Promise.all([
      prisma.bug.findUnique({ where: { id: contextId }, select: { senderId: true } }),
      prisma.bugParticipant.findMany({
        where: { bugId: contextId },
        select: { userId: true },
      }),
    ]);
    const ids = new Set<string>();
    if (bug?.senderId) ids.add(bug.senderId);
    for (const p of bugParticipants) ids.add(p.userId);
    return [...ids];
  }

  return [];
}

export async function notifyUserContextUnreadAuthority(params: {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  reason: ContextUnreadAuthorityReason;
  bugGroupChannelId?: string | null;
}): Promise<void> {
  const resolved = resolveMessageUnreadContext(
    params.chatContextType,
    params.contextId,
    params.bugGroupChannelId
  );
  if (!resolved) return;

  await UnreadAuthority.recordContextChanged({
    userId: params.userId,
    contextKey: resolved.contextKey,
    contextType: resolved.contextType,
    contextId: resolved.contextId,
    reason: params.reason,
    ...(resolved.countAdapter ? { countAdapter: resolved.countAdapter } : {}),
    ...(resolved.groupChannelMeta ? { groupChannelMeta: resolved.groupChannelMeta } : {}),
  });
}

export async function notifyContextParticipantsUnreadAuthority(params: {
  chatContextType: ChatContextType;
  contextId: string;
  reason: ContextUnreadAuthorityReason;
  bugGroupChannelId?: string | null;
}): Promise<void> {
  const userIds = await getViewerUserIdsForContext(params.chatContextType, params.contextId);
  if (userIds.length === 0) return;

  await Promise.all(
    userIds.map((userId) =>
      notifyUserContextUnreadAuthority({
        userId,
        chatContextType: params.chatContextType,
        contextId: params.contextId,
        reason: params.reason,
        bugGroupChannelId: params.bugGroupChannelId,
      })
    )
  );
}

export async function notifyMessageDeletedUnread(params: {
  chatContextType: ChatContextType;
  contextId: string;
}): Promise<void> {
  let bugGroupChannelId: string | null | undefined;
  if (params.chatContextType === 'BUG') {
    const map = await lookupBugGroupChannelIds([params.contextId]);
    bugGroupChannelId = map.get(params.contextId) ?? null;
  }

  await notifyContextParticipantsUnreadAuthority({
    chatContextType: params.chatContextType,
    contextId: params.contextId,
    reason: 'message_deleted',
    bugGroupChannelId,
  });
}
