import type { ChatContextType, ChatType } from '@prisma/client';
import prisma from '../../config/database';
import { getChatNotifier } from './chatNotifier';
import { loadActorReadCursorsForSocket } from './actorReadCursorSocket';
import { lookupBugGroupChannelIds } from './bugGroupChannelLookup';

async function emitReadCursorsToRoom(args: {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  readCursors: Awaited<ReturnType<typeof loadActorReadCursorsForSocket>>;
  syncSeq?: number;
  notifyUserIds?: string[];
}): Promise<void> {
  const { userId, chatContextType, contextId, readCursors, syncSeq, notifyUserIds } = args;
  if (readCursors.length === 0) return;
  getChatNotifier().emitChatEvent(
    chatContextType,
    contextId,
    'read-receipt',
    {
      readReceipt: {
        userId,
        readAt: new Date().toISOString(),
        allRead: true,
      },
      readCursor: readCursors[0],
      readCursors,
    },
    undefined,
    syncSeq,
    notifyUserIds
  );
}

/** Fan out actor read cursor(s) so open peers can update ✓✓ without waiting for sync poll. */
export async function emitPeerReadCursorsAfterMark(args: {
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  syncSeq?: number;
  chatTypes?: ChatType[];
  /** Prefer true when markedCount > 0; still useful to rebroadcast after catch-up if syncSeq set. */
  force?: boolean;
  /** Primary room already notified (e.g. mark-one / react); only BUG↔GROUP mirror. */
  mirrorsOnly?: boolean;
}): Promise<void> {
  const { userId, chatContextType, contextId, syncSeq, chatTypes, force, mirrorsOnly } = args;
  if (syncSeq == null && !force) return;

  if (!mirrorsOnly) {
    const readCursors = await loadActorReadCursorsForSocket(
      userId,
      chatContextType,
      contextId,
      chatTypes
    );
    if (readCursors.length === 0) return;

    let notifyUserIds: string[] | undefined;
    if (chatContextType === 'USER') {
      const peers = await prisma.userChat.findUnique({
        where: { id: contextId },
        select: { user1Id: true, user2Id: true },
      });
      if (peers) {
        notifyUserIds = [peers.user1Id, peers.user2Id].filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        );
      }
    }

    await emitReadCursorsToRoom({
      userId,
      chatContextType,
      contextId,
      readCursors,
      syncSeq,
      notifyUserIds,
    });
  }

  // Bug threads: FE mark-read uses GROUP channel id; legacy/hydrate may still use BUG + bugId.
  if (chatContextType === 'GROUP') {
    const bugId = (
      await prisma.groupChannel.findUnique({
        where: { id: contextId },
        select: { bugId: true },
      })
    )?.bugId;
    if (bugId) {
      const bugCursors = await loadActorReadCursorsForSocket(userId, 'BUG', bugId, chatTypes);
      await emitReadCursorsToRoom({
        userId,
        chatContextType: 'BUG',
        contextId: bugId,
        readCursors: bugCursors,
        syncSeq,
      });
    }
  } else if (chatContextType === 'BUG') {
    const groupId = (await lookupBugGroupChannelIds([contextId])).get(contextId);
    if (groupId) {
      const groupCursors = await loadActorReadCursorsForSocket(userId, 'GROUP', groupId, chatTypes);
      await emitReadCursorsToRoom({
        userId,
        chatContextType: 'GROUP',
        contextId: groupId,
        readCursors: groupCursors,
        syncSeq,
      });
    }
  }
}
