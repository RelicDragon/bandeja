import { ChatContextType } from '@prisma/client';
import { ParticipantRole } from '@prisma/client';
import prisma from '../../config/database';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { GameChatViewerAccessService } from './gameChatViewerAccess.service';
import { canParticipantSeeGameChatMessage } from './gameChatVisibility';
import { extractChatTypeFromEmitPayload } from './gameChatSocketRecipients';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { shouldHideRosterLifecycleSystemMessage } from './gameChatRosterVisibility';

export type GameChatSyncAccess = {
  game: { status: string };
  participant: { status: string; role: string } | undefined;
  isParentGameAdminOrOwner: boolean;
};

export async function resolveGameChatSyncAccess(
  gameId: string,
  userId: string
): Promise<GameChatSyncAccess | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, status: true },
  });
  if (game) {
    const participant = await prisma.gameParticipant.findFirst({
      where: { gameId, userId },
      select: { status: true, role: true },
    });

    const isParentGameAdminOrOwner = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN]
    );

    return {
      game,
      participant: participant ?? undefined,
      isParentGameAdminOrOwner,
    };
  }

  const access = await GameChatViewerAccessService.resolve(gameId, userId);
  if (!access || access.lifecycle !== 'archived' || !access.isParticipant) {
    return null;
  }

  const participant = access.participant
    ? { status: access.participant.status, role: access.participant.role }
    : undefined;

  const isParentGameAdminOrOwner = participant
    ? false
    : await GameChatViewerAccessService.hasArchivedParentAdminAccess(access.stub, userId);

  return {
    game: { status: 'ARCHIVED' },
    participant,
    isParentGameAdminOrOwner,
  };
}

function extractPayloadMessageContent(payload: unknown): { senderId?: string | null; content?: string | null } {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as Record<string, unknown>;
  const message = record.message;
  if (message && typeof message === 'object') {
    const msg = message as Record<string, unknown>;
    return {
      senderId: typeof msg.senderId === 'string' || msg.senderId === null ? (msg.senderId as string | null) : undefined,
      content: typeof msg.content === 'string' ? msg.content : undefined,
    };
  }
  return {
    content: typeof record.content === 'string' ? record.content : undefined,
  };
}

/** Events without embedded chatType are not game-chat scoped (pass through). */
export function canUserSeeGameChatSyncEvent(payload: unknown, access: GameChatSyncAccess): boolean {
  const { senderId, content } = extractPayloadMessageContent(payload);
  if (
    shouldHideRosterLifecycleSystemMessage({
      participantStatus: access.participant?.status,
      senderId,
      content,
    })
  ) {
    return false;
  }
  const chatType = extractChatTypeFromEmitPayload(payload);
  if (!chatType) return true;
  return canParticipantSeeGameChatMessage(
    access.participant,
    access.game,
    chatType,
    access.isParentGameAdminOrOwner
  );
}

const MAX_FILTER_SCAN_PAGES = 12;

/**
 * Returns events the user may apply locally. Inaccessible events are dropped but their seq
 * values are returned as nextAfterSeq so clients can consume filtered pages too.
 * The cursor must never pass a visible event omitted by the response limit.
 */
export async function getFilteredGameSyncEventsAfter(
  contextId: string,
  afterSeq: number,
  limit: number,
  userId: string
): Promise<{
  events: Awaited<ReturnType<typeof ChatSyncEventService.getEventsAfter>>;
  hasMore: boolean;
  nextAfterSeq: number;
}> {
  const access = await resolveGameChatSyncAccess(contextId, userId);
  if (!access) return { events: [], hasMore: false, nextAfterSeq: afterSeq };

  const visible: Awaited<ReturnType<typeof ChatSyncEventService.getEventsAfter>> = [];
  let cursor = afterSeq;
  let hasMore = false;
  let pages = 0;

  while (visible.length < limit && pages < MAX_FILTER_SCAN_PAGES) {
    const batch = await ChatSyncEventService.getEventsAfter(
      ChatContextType.GAME,
      contextId,
      cursor,
      limit
    );
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    for (let i = 0; i < batch.length; i += 1) {
      const event = batch[i]!;
      cursor = event.seq;
      if (canUserSeeGameChatSyncEvent(event.payload, access)) visible.push(event);
      if (visible.length === limit) {
        return {
          events: visible,
          hasMore: i < batch.length - 1 || batch.length === limit,
          nextAfterSeq: cursor,
        };
      }
    }
    hasMore = batch.length === limit;
    pages += 1;
    if (!hasMore) break;
  }

  return { events: visible, hasMore, nextAfterSeq: cursor };
}
