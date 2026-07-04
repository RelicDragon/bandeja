import { ChatSyncEventType } from '@bandeja/chat-contract';
import {
  ChatContextType,
  ChatType,
  ParticipantRole,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { chatAutoTranslateTypeKey } from '../../utils/chatAutoTranslateKey';
import { TRANSLATE_TO_LANGUAGE_CODES } from './translation.service';
import { GroupChannelService } from './groupChannel.service';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { GameChatContextService } from '../game/gameChatContext.service';
import { GameChatViewerAccessService } from './gameChatViewerAccess.service';

export type AutoTranslateConfigResponse = {
  languageCodes: string[];
  maxSlots: number;
  canEdit: boolean;
};

export class ChatAutoTranslateService {
  static async getParticipantCount(
    chatContextType: ChatContextType,
    contextId: string
  ): Promise<number> {
    if (chatContextType === 'USER') return 2;
    if (chatContextType === 'GROUP') {
      const gc = await prisma.groupChannel.findUnique({
        where: { id: contextId },
        select: { participantsCount: true },
      });
      return gc?.participantsCount ?? 0;
    }
    if (chatContextType === 'BUG') {
      const bugParticipants = await prisma.bugParticipant.count({
        where: { bugId: contextId },
      });
      return bugParticipants + 1;
    }
    if (chatContextType === 'GAME') {
      const lifecycle = await GameChatContextService.resolve(contextId);
      if (lifecycle === 'cancelled') {
        return prisma.cancelledGameParticipant.count({ where: { gameId: contextId } });
      }
      return prisma.gameParticipant.count({ where: { gameId: contextId } });
    }
    return 0;
  }

  static maxSlotsForCount(count: number): number {
    return count < 3 ? 2 : 3;
  }

  static async canEdit(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string
  ): Promise<boolean> {
    if (chatContextType === 'USER') {
      const uc = await prisma.userChat.findUnique({
        where: { id: contextId },
        select: { user1Id: true, user2Id: true },
      });
      return !!uc && (uc.user1Id === userId || uc.user2Id === userId);
    }
    if (chatContextType === 'GROUP') {
      const channel = await prisma.groupChannel.findUnique({
        where: { id: contextId },
        select: { isCityGroup: true },
      });
      if (channel?.isCityGroup) {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { isAdmin: true },
        });
        if (u?.isAdmin) return true;
      }
      return GroupChannelService.isGroupChannelAdminOrOwner(contextId, userId);
    }
    if (chatContextType === 'GAME') {
      const lifecycle = await GameChatContextService.resolve(contextId);
      if (lifecycle === 'cancelled') {
        const direct = await prisma.cancelledGameParticipant.findFirst({
          where: {
            gameId: contextId,
            userId,
            role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] },
          },
        });
        if (direct) return true;
        const stub = await prisma.cancelledGame.findUnique({
          where: { id: contextId },
        });
        if (stub?.parentId) {
          return GameChatViewerAccessService.hasArchivedParentAdminAccess(stub, userId);
        }
        return false;
      }
      const direct = await prisma.gameParticipant.findFirst({
        where: {
          gameId: contextId,
          userId,
          role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] },
        },
      });
      if (direct) return true;
      return hasParentGamePermissionWithUserCheck(contextId, userId, [
        ParticipantRole.OWNER,
        ParticipantRole.ADMIN,
      ]);
    }
    if (chatContextType === 'BUG') {
      const bug = await prisma.bug.findUnique({
        where: { id: contextId },
        select: { senderId: true },
      });
      if (!bug) return false;
      if (bug.senderId === userId) return true;
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      });
      return !!u?.isAdmin;
    }
    return false;
  }

  static async assertCanView(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string
  ): Promise<void> {
    const { MessageService } = await import('./message.service');
    await MessageService.validateMessageAccess(
      {
        chatContextType,
        contextId,
        chatType: ChatType.PUBLIC,
      },
      userId,
      false
    );
  }

  static async getConfig(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    chatType?: ChatType | null
  ): Promise<AutoTranslateConfigResponse> {
    await this.assertCanView(userId, chatContextType, contextId);
    const chatTypeKey = chatAutoTranslateTypeKey(chatContextType, chatType);
    const row = await prisma.chatAutoTranslateConfig.findUnique({
      where: {
        chatContextType_contextId_chatTypeKey: {
          chatContextType,
          contextId,
          chatTypeKey,
        },
      },
    });
    const count = await this.getParticipantCount(chatContextType, contextId);
    const canEdit = await this.canEdit(userId, chatContextType, contextId);
    return {
      languageCodes: row?.languageCodes ?? [],
      maxSlots: this.maxSlotsForCount(count),
      canEdit,
    };
  }

  static async setConfig(
    userId: string,
    chatContextType: ChatContextType,
    contextId: string,
    languageCodes: string[],
    chatType?: ChatType | null
  ): Promise<AutoTranslateConfigResponse> {
    if (chatContextType === 'GAME') {
      await GameChatViewerAccessService.assertWritable(contextId, userId);
    }
    const canEdit = await this.canEdit(userId, chatContextType, contextId);
    if (!canEdit) {
      throw new ApiError(403, 'Only chat admins can edit auto-translate languages');
    }
    await this.assertCanView(userId, chatContextType, contextId);

    const normalized = [
      ...new Set(
        languageCodes.map((c) => c.trim().toLowerCase()).filter(Boolean)
      ),
    ];
    for (const code of normalized) {
      if (!TRANSLATE_TO_LANGUAGE_CODES.includes(code)) {
        throw new ApiError(400, `Invalid language code: ${code}`);
      }
    }

    const count = await this.getParticipantCount(chatContextType, contextId);
    const maxSlots = this.maxSlotsForCount(count);
    if (normalized.length > maxSlots) {
      throw new ApiError(
        400,
        `At most ${maxSlots} auto-translate languages allowed for this chat`
      );
    }

    const chatTypeKey = chatAutoTranslateTypeKey(chatContextType, chatType);

    await prisma.$transaction(async (tx) => {
      await tx.chatAutoTranslateConfig.upsert({
        where: {
          chatContextType_contextId_chatTypeKey: {
            chatContextType,
            contextId,
            chatTypeKey,
          },
        },
        create: {
          chatContextType,
          contextId,
          chatTypeKey,
          languageCodes: normalized,
          updatedByUserId: userId,
        },
        update: {
          languageCodes: normalized,
          updatedByUserId: userId,
        },
      });
      const { ChatSyncEventService } = await import('./chatSyncEvent.service');
      await ChatSyncEventService.appendEventInTransaction(
        tx,
        chatContextType,
        contextId,
        ChatSyncEventType.CHAT_AUTO_TRANSLATE_CONFIG_UPDATED,
        { languageCodes: normalized, chatTypeKey }
      );
    });

    const socketService = (global as any).socketService;
    if (socketService?.emitAutoTranslateConfigUpdated) {
      socketService.emitAutoTranslateConfigUpdated(
        chatContextType,
        contextId,
        normalized,
        chatTypeKey
      );
    }

    const { ChatAutoTranslateRedis } = await import('./chatAutoTranslateRedis.service');
    await ChatAutoTranslateRedis.setLanguageCodes(
      chatContextType,
      contextId,
      chatTypeKey,
      normalized
    );

    return this.getConfig(userId, chatContextType, contextId, chatType);
  }

  static async getLanguageCodesForMessage(message: {
    chatContextType: ChatContextType;
    contextId: string;
    chatType: ChatType;
  }): Promise<string[]> {
    const chatTypeKey = chatAutoTranslateTypeKey(
      message.chatContextType,
      message.chatType
    );
    const { ChatAutoTranslateRedis } = await import('./chatAutoTranslateRedis.service');
    const cached = await ChatAutoTranslateRedis.getLanguageCodes(
      message.chatContextType,
      message.contextId,
      chatTypeKey
    );
    if (cached !== null) return cached;

    const row = await prisma.chatAutoTranslateConfig.findUnique({
      where: {
        chatContextType_contextId_chatTypeKey: {
          chatContextType: message.chatContextType,
          contextId: message.contextId,
          chatTypeKey,
        },
      },
    });
    const languageCodes = row?.languageCodes ?? [];
    void ChatAutoTranslateRedis.setLanguageCodes(
      message.chatContextType,
      message.contextId,
      chatTypeKey,
      languageCodes
    );
    return languageCodes;
  }
}
