import { ChatType } from '@prisma/client';
import prisma from '../../config/database';
import { canParticipantSeeGameChatMessage } from './gameChatVisibility';

const EXCLUDED_PARTICIPANT_STATUSES = ['INVITED', 'INVITE_DECLINED', 'INVITE_CANCELLED'] as const;

export function extractChatTypeFromEmitPayload(data: unknown): ChatType | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  const message = record.message;
  if (message && typeof message === 'object') {
    const chatType = (message as Record<string, unknown>).chatType;
    if (typeof chatType === 'string' && (Object.values(ChatType) as string[]).includes(chatType)) {
      return chatType as ChatType;
    }
  }
  const direct = record.chatType;
  if (typeof direct === 'string' && (Object.values(ChatType) as string[]).includes(direct)) {
    return direct as ChatType;
  }
  return undefined;
}

export async function resolveGameChatSocketRecipientIds(
  gameId: string,
  chatType: ChatType
): Promise<string[]> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, status: true, parentId: true },
  });
  if (!game) return [];

  const participants = await prisma.gameParticipant.findMany({
    where: {
      gameId,
      status: { notIn: [...EXCLUDED_PARTICIPANT_STATUSES] },
    },
    select: { userId: true, status: true, role: true },
  });

  let parentAdminUserIds = new Set<string>();
  if (game.parentId) {
    const parentAdmins = await prisma.gameParticipant.findMany({
      where: {
        gameId: game.parentId,
        role: { in: ['OWNER', 'ADMIN'] },
        status: { notIn: [...EXCLUDED_PARTICIPANT_STATUSES] },
      },
      select: { userId: true },
    });
    parentAdminUserIds = new Set(parentAdmins.map((p) => p.userId));
  }

  const recipientIds: string[] = [];
  const participantUserIds = new Set(participants.map((p) => p.userId));

  for (const participant of participants) {
    const isParentGameAdminOrOwner = parentAdminUserIds.has(participant.userId);
    if (canParticipantSeeGameChatMessage(participant, game, chatType, isParentGameAdminOrOwner)) {
      recipientIds.push(participant.userId);
    }
  }

  if (game.parentId && chatType !== ChatType.PRIVATE) {
    for (const parentUserId of parentAdminUserIds) {
      if (
        !participantUserIds.has(parentUserId) &&
        canParticipantSeeGameChatMessage(undefined, game, chatType, true)
      ) {
        recipientIds.push(parentUserId);
      }
    }
  }

  return recipientIds;
}
