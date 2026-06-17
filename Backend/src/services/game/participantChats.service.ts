import prisma from '../../config/database';
import { ChatContextType, ChatType } from '@prisma/client';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType } from '../../utils/systemMessages';
import notificationService from '../notification.service';

const ACTIVATION_MESSAGE_BY_CHAT_TYPE: Record<'PRIVATE' | 'ADMINS', SystemMessageType> = {
  PRIVATE: SystemMessageType.PARTICIPANTS_ONLY_CHAT_CREATED,
  ADMINS: SystemMessageType.ADMINS_CHAT_CREATED,
};

function parseSystemMessageType(content: string): SystemMessageType | null {
  try {
    const parsed = JSON.parse(content) as { type?: string };
    if (parsed?.type && typeof parsed.type === 'string') {
      return parsed.type as SystemMessageType;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

async function channelHasActivationMessage(
  gameId: string,
  chatType: 'PRIVATE' | 'ADMINS'
): Promise<boolean> {
  const expectedType = ACTIVATION_MESSAGE_BY_CHAT_TYPE[chatType];
  const messages = await prisma.chatMessage.findMany({
    where: {
      chatContextType: ChatContextType.GAME,
      contextId: gameId,
      gameId,
      chatType,
      senderId: null,
    },
    select: { content: true },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });
  return messages.some((m) => parseSystemMessageType(m.content ?? '') === expectedType);
}

async function createActivationMessage(
  gameId: string,
  chatType: 'PRIVATE' | 'ADMINS'
): Promise<void> {
  const messageType = ACTIVATION_MESSAGE_BY_CHAT_TYPE[chatType];
  const systemMessage = await createSystemMessage(
    gameId,
    { type: messageType, variables: {} },
    chatType === 'PRIVATE' ? ChatType.PRIVATE : ChatType.ADMINS,
    ChatContextType.GAME
  );

  if (!systemMessage) return;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      court: { include: { club: true } },
      club: true,
    },
  });

  if (game) {
    notificationService.sendGameSystemMessageNotification(systemMessage, game).catch((error) => {
      console.error(`Failed to send notifications for ${messageType}:`, error);
    });
  }
}

export interface EnableParticipantChatsResult {
  privateEnabled: boolean;
  adminsEnabled: boolean;
  created: boolean;
}

export class ParticipantChatsService {
  static async enableParticipantChats(gameId: string): Promise<EnableParticipantChatsResult> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    if (!game) {
      return { privateEnabled: false, adminsEnabled: false, created: false };
    }

    const [privateAlready, adminsAlready] = await Promise.all([
      channelHasActivationMessage(gameId, 'PRIVATE'),
      channelHasActivationMessage(gameId, 'ADMINS'),
    ]);

    let created = false;

    if (!privateAlready) {
      await createActivationMessage(gameId, 'PRIVATE');
      created = true;
    }
    if (!adminsAlready) {
      await createActivationMessage(gameId, 'ADMINS');
      created = true;
    }

    return {
      privateEnabled: true,
      adminsEnabled: true,
      created,
    };
  }
}
