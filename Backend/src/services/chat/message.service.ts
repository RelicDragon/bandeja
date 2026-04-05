import prisma from '../../config/database';
import {
  MessageState,
  ChatType,
  ChatContextType,
  ParticipantRole,
  PollType,
  Prisma,
  MessageType,
  ChatSyncEventType,
} from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import notificationService from '../notification.service';
import { GameReadService } from '../game/read.service';
import { UserChatService } from './userChat.service';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { TranslationService } from './translation.service';
import { MESSAGE_TRANSCRIPTION_PENDING } from './transcriptionPending';
import { ReadReceiptService } from './readReceipt.service';
import { DraftService } from './draft.service';
import { ChatMuteService } from './chatMute.service';
import { updateLastMessagePreview } from './lastMessagePreview.service';
import { computeContentSearchable, computeVoiceContentSearchable } from '../../utils/messageSearchContent';
import { ImageProcessor } from '../../utils/imageProcessor';
import { S3Service } from '../s3.service';
import { config } from '../../config/env';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { normalizeChatClientMutationId } from '../../utils/chatClientMutationId';
import { chatSyncMessageUpdatedCompactPayload } from '../../utils/chatSyncMessageUpdatePayload';

const VOICE_MESSAGE_MAX_MS = 30 * 60 * 1000;

function isPrismaUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function isAllowedChatVoiceMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  let key: string;
  try {
    key = S3Service.extractS3Key(url);
  } catch {
    return false;
  }
  if (!/^uploads\/chat\/voice\/[a-zA-Z0-9._-]+$/.test(key)) return false;
  const allowedHost = config.aws.cloudFrontDomain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return new URL(url).hostname.toLowerCase() === allowedHost;
    } catch {
      return false;
    }
  }
  return true;
}

export class MessageService {
  static async validateGameAccess(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { userId },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const participant = game.participants[0];
    const isDirectParticipant = game.participants.length > 0;
    const hasParentParticipantPermission = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT]
    );
    const hasPermission = isDirectParticipant || hasParentParticipantPermission;
    const hasPendingInvite = participant?.status === 'INVITED';

    return { game, isParticipant: hasPermission, hasPendingInvite, participant };
  }

  static async validateBugAccess(bugId: string, userId: string, requireWriteAccess: boolean = false) {
    const bug = await prisma.bug.findUnique({
      where: { id: bugId },
      include: {
        sender: true,
        participants: {
          where: { userId }
        },
        groupChannel: { select: { id: true } }
      }
    });

    if (!bug) {
      throw new ApiError(404, 'Bug not found');
    }

    // Check if user is the bug sender or an admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true }
    });

    if (!user) {
      throw new ApiError(401, 'User not found');
    }

    const isSender = bug.senderId === userId;
    const isAdmin = user.isAdmin;
    const isParticipant = bug.participants.length > 0;

    // For viewing: everyone can view bug chats
    // For writing: must be sender, admin, or participant
    if (requireWriteAccess && !isSender && !isAdmin && !isParticipant) {
      throw new ApiError(403, 'You must join the chat to send messages');
    }

    return { bug, isSender, isAdmin, isParticipant };
  }

  static async validateUserChatAccess(userChatId: string, userId: string, requireSendPermission = false) {
    const userChat = requireSendPermission
      ? await prisma.userChat.findUnique({
          where: { id: userChatId },
          include: {
            user1: { select: { allowMessagesFromNonContacts: true } },
            user2: { select: { allowMessagesFromNonContacts: true } }
          }
        })
      : await prisma.userChat.findUnique({ where: { id: userChatId } });

    if (!userChat) {
      throw new ApiError(404, 'Chat not found');
    }

    if (userChat.user1Id !== userId && userChat.user2Id !== userId) {
      throw new ApiError(403, 'You are not a participant in this chat');
    }

    if (requireSendPermission) {
      const uc = userChat as typeof userChat & { user1?: { allowMessagesFromNonContacts: boolean | null }; user2?: { allowMessagesFromNonContacts: boolean | null } };
      const recipient = uc.user1Id === userId ? uc.user2 : uc.user1;
      const allowed = uc.user1Id === userId ? uc.user2allowed : uc.user1allowed;
      const recipientAllowsNonContacts = recipient?.allowMessagesFromNonContacts !== false;
      if (!allowed && !recipientAllowsNonContacts) {
        throw new ApiError(403, 'Cannot send message - user has not allowed messages');
      }
    }

    return { userChat };
  }

  static async validateGroupChannelAccess(groupChannelId: string, userId: string, requireWriteAccess: boolean = false) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId },
      include: {
        participants: {
          where: { userId }
        }
      }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const userParticipant = groupChannel.participants.find(p => p.userId === userId);
    const isOwner = userParticipant?.role === ParticipantRole.OWNER;
    const isParticipant = !!userParticipant;

    // For viewing: must be owner, participant, or public
    if (!isOwner && !isParticipant && !groupChannel.isPublic) {
      throw new ApiError(403, 'You are not a participant in this group/channel');
    }

    // For writing: Channel = owner or admin, Group = any participant
    const isAdmin = userParticipant?.role === ParticipantRole.ADMIN;
    const canWrite = groupChannel.isChannel
      ? (isOwner || isAdmin)
      : isParticipant;

    if (requireWriteAccess && !canWrite) {
      throw new ApiError(403, groupChannel.isChannel
        ? 'Only owner or admin can post in channels'
        : 'You must be a participant to post');
    }

    return { groupChannel, isOwner, isParticipant, canWrite };
  }

  static async validateChatTypeAccess(participant: any, chatType: ChatType, game: any, userId: string, gameId: string, requireWriteAccess: boolean = false) {
    const isParentGameAdminOrOwner = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN]
    );
    const isParentParticipant = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT]
    );

    const isPlaying = participant && (participant.status === 'PLAYING');
    const isNonPlaying = participant && (participant.status === 'NON_PLAYING');
    const isAdminOrOwner = participant && (participant.role === 'OWNER' || participant.role === 'ADMIN');

    if (chatType === ChatType.PUBLIC) {
      if (requireWriteAccess) {
        const isDirectParticipant = !!participant;
        if (!isDirectParticipant && !isParentParticipant) {
          throw new ApiError(403, 'Only participants can write in public chat');
        }
      }
      return;
    }

    if (chatType === ChatType.PRIVATE) {
      if (!isPlaying && !isNonPlaying && !isAdminOrOwner && !isParentGameAdminOrOwner) {
        throw new ApiError(403, 'Only participants can access private chat');
      }
      return;
    }

    if (chatType === ChatType.ADMINS) {
      if (!isAdminOrOwner && !isParentGameAdminOrOwner) {
        throw new ApiError(403, 'Only game owners and admins can access admin chat');
      }
      return;
    }

    if (chatType === ChatType.PHOTOS) {
      if (game.status === 'ANNOUNCED') {
        throw new ApiError(403, 'Photos chat is only available when game has started');
      }
      if (requireWriteAccess && !isPlaying && !isAdminOrOwner && !isParentGameAdminOrOwner) {
        throw new ApiError(403, 'Only playing participants, admins, and owners can write in photos chat');
      }
      return;
    }

    throw new ApiError(403, 'Access denied');
  }

  static async validateMessageAccess(
    message: { chatContextType: string; contextId: string; chatType: ChatType },
    userId: string,
    requireWriteAccess: boolean = false
  ) {
    if (message.chatContextType === 'GAME') {
      const { participant, game, isParticipant } = await this.validateGameAccess(message.contextId, userId);
      if (!isParticipant) {
        throw new ApiError(403, 'Access denied');
      }
      await this.validateChatTypeAccess(participant, message.chatType, game, userId, message.contextId, false);
    } else if (message.chatContextType === 'BUG') {
      await this.validateBugAccess(message.contextId, userId, requireWriteAccess);
    } else if (message.chatContextType === 'USER') {
      await this.validateUserChatAccess(message.contextId, userId);
    } else if (message.chatContextType === 'GROUP') {
      await this.validateGroupChannelAccess(message.contextId, userId);
    }
  }

  static generateThumbnailUrls(mediaUrls: string[]): string[] {
    return mediaUrls.map(originalUrl => {
      if (!originalUrl) return originalUrl;

      if (originalUrl.includes('/uploads/chat/originals/')) {
        const filename = originalUrl.split('/').pop() || '';
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        const thumbnailFilename = `${nameWithoutExt}_thumb.jpg`;

        const thumbnailUrl = originalUrl
          .replace('/uploads/chat/originals/', '/uploads/chat/thumbnails/')
          .replace(filename, thumbnailFilename);

        return thumbnailUrl;
      }

      return originalUrl;
    });
  }

  static getMessageInclude() {
    return {
      sender: {
        select: USER_SELECT_FIELDS
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          messageType: true,
          mediaUrls: true,
          audioDurationMs: true,
          sender: {
            select: USER_SELECT_FIELDS
          }
        }
      },
      reactions: {
        include: {
          user: {
            select: USER_SELECT_FIELDS
          }
        }
      },
      readReceipts: {
        include: {
          user: {
            select: USER_SELECT_FIELDS
          }
        }
      },
      poll: {
        include: {
          options: {
            include: {
              votes: {
                include: {
                  user: { select: USER_SELECT_FIELDS }
                }
              }
            },
            orderBy: {
              order: Prisma.SortOrder.asc
            }
          },
          votes: {
            include: {
              user: { select: USER_SELECT_FIELDS }
            }
          }
        }
      }
    };
  }

  static async enrichMessagesWithTranslations(
    messages: any[],
    languageCode: string
  ): Promise<any[]> {
    if (!messages || messages.length === 0) {
      return messages;
    }

    const messageIds = messages.map(m => m.id);
    const translations = await prisma.messageTranslation.findMany({
      where: {
        messageId: { in: messageIds },
        languageCode: languageCode
      },
      select: {
        messageId: true,
        languageCode: true,
        translation: true
      }
    });

    const translationMap = new Map(translations.map(t => [t.messageId, t]));

    const voiceMessageIds = messages.filter((m: { messageType?: string }) => m.messageType === 'VOICE').map((m: { id: string }) => m.id);
    const transcriptionRows =
      voiceMessageIds.length > 0
        ? await prisma.messageTranscription.findMany({
            where: { messageId: { in: voiceMessageIds } },
            select: { messageId: true, transcription: true, languageCode: true },
          })
        : [];
    const transcriptionMap = new Map(transcriptionRows.map((r) => [r.messageId, r]));

    return messages.map(message => {
      const { serverSyncSeq, ...rest } = message as typeof message & { serverSyncSeq?: number | null };
      const translation = translationMap.get(message.id);
      const trRow = transcriptionMap.get(message.id);
      const audioTranscription =
        trRow &&
        trRow.transcription &&
        trRow.transcription !== MESSAGE_TRANSCRIPTION_PENDING
          ? { transcription: trRow.transcription, languageCode: trRow.languageCode }
          : undefined;
      let sanitized = {
        ...rest,
        syncSeq: serverSyncSeq ?? (message as { syncSeq?: number }).syncSeq,
        translation: translation ? {
          languageCode: translation.languageCode,
          translation: translation.translation
        } : undefined,
        audioTranscription,
      };
      if (message.poll?.isAnonymous && message.poll.options) {
        sanitized = {
          ...sanitized,
          poll: {
            ...message.poll,
            options: message.poll.options.map((o: any) => ({
              ...o,
              votes: o.votes?.map((v: any) => ({ ...v, user: undefined })) ?? []
            })),
            votes: message.poll.votes?.map((v: any) => ({ ...v, user: undefined })) ?? []
          }
        };
      }
      return sanitized;
    });
  }

  static async createMessage(data: {
    chatContextType: ChatContextType;
    contextId: string;
    senderId: string;
    content?: string;
    mediaUrls: string[];
    replyToId?: string;
    chatType: ChatType;
    mentionIds?: string[];
    messageType?: MessageType;
    audioDurationMs?: number | null;
    waveformData?: number[];
    poll?: {
      question: string;
      options: string[];
      type: PollType;
      isAnonymous: boolean;
      allowsMultipleAnswers: boolean;
      quizCorrectOptionIndex?: number;
    };
    clientMutationId?: string | null;
  }) {
    const {
      chatContextType,
      contextId,
      senderId,
      content,
      mediaUrls,
      replyToId,
      chatType,
      mentionIds = [],
      poll,
      messageType: requestedMessageType,
      audioDurationMs,
      waveformData,
    } = data;

    const cid = normalizeChatClientMutationId(data.clientMutationId);

    // Validate access based on context type
    let game, participant, bug, userChat, groupChannel;

    if (chatContextType === 'GAME') {
      const result = await this.validateGameAccess(contextId, senderId);
      game = result.game;
      participant = result.participant;
      await this.validateChatTypeAccess(participant, chatType, game, senderId, contextId, true);
    } else if (chatContextType === 'BUG') {
      const result = await this.validateBugAccess(contextId, senderId, true);
      bug = result.bug;
    } else if (chatContextType === 'USER') {
      const result = await this.validateUserChatAccess(contextId, senderId, true);
      userChat = result.userChat;
    } else if (chatContextType === 'GROUP') {
      await this.validateGroupChannelAccess(contextId, senderId, true);
      groupChannel = await prisma.groupChannel.findUnique({
        where: { id: contextId },
        include: { bug: { select: { id: true } }, marketItem: { select: { id: true } } }
      });
    }

    if (replyToId) {
      const replyToMessage = await prisma.chatMessage.findFirst({
        where: {
          id: replyToId,
          chatContextType,
          contextId,
          deletedAt: null,
        }
      });

      if (!replyToMessage) {
        throw new ApiError(404, 'Reply message not found');
      }
    }

    let resolvedMessageType: MessageType;
    if (poll) {
      resolvedMessageType = MessageType.POLL;
    } else if (requestedMessageType === MessageType.VOICE) {
      resolvedMessageType = MessageType.VOICE;
    } else if (mediaUrls.length > 0) {
      resolvedMessageType = MessageType.IMAGE;
    } else {
      resolvedMessageType = MessageType.TEXT;
    }

    if (poll && mediaUrls.length > 0) {
      throw new ApiError(400, 'Poll messages cannot include media');
    }

    let voiceWaveform: number[] = [];
    if (resolvedMessageType === MessageType.VOICE) {
      if (poll) {
        throw new ApiError(400, 'Voice messages cannot include a poll');
      }
      if (mediaUrls.length !== 1) {
        throw new ApiError(400, 'Voice message requires exactly one audio URL');
      }
      if (audioDurationMs == null || audioDurationMs < 500 || audioDurationMs > VOICE_MESSAGE_MAX_MS) {
        throw new ApiError(400, 'Invalid voice message duration');
      }
      const wf = Array.isArray(waveformData) ? waveformData : [];
      if (wf.length < 1 || wf.length > 80) {
        throw new ApiError(400, 'Invalid waveform data');
      }
      if (!wf.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1)) {
        throw new ApiError(400, 'Invalid waveform values');
      }
      const url = mediaUrls[0];
      if (!url || !isAllowedChatVoiceMediaUrl(url)) {
        throw new ApiError(400, 'Invalid voice audio URL');
      }
      voiceWaveform = wf;
    } else if (requestedMessageType === MessageType.VOICE) {
      throw new ApiError(400, 'Invalid voice message payload');
    }

    const thumbnailUrls =
      resolvedMessageType === MessageType.VOICE ? [] : this.generateThumbnailUrls(mediaUrls);

    const contentForStore =
      resolvedMessageType === MessageType.VOICE
        ? ''
        : content?.startsWith('[TYPE:')
          ? content.substring(1)
          : (content ?? '');

    const contentSearchableValue =
      resolvedMessageType === MessageType.VOICE && audioDurationMs != null
        ? computeVoiceContentSearchable(audioDurationMs)
        : computeContentSearchable(content ?? null, poll?.question);

    if (cid) {
      const existing = await prisma.chatMessage.findFirst({
        where: { senderId, clientMutationId: cid },
        include: this.getMessageInclude(),
      });
      if (existing) {
        if (existing.chatContextType !== chatContextType || existing.contextId !== contextId) {
          console.warn('[chat] clientMutationId conflict (wrong context)', {
            senderId,
            cid,
            wanted: { chatContextType, contextId },
            found: { chatContextType: existing.chatContextType, contextId: existing.contextId },
          });
          throw new ApiError(409, 'clientMutationId already used for another conversation');
        }
        const headSeq = await ChatSyncEventService.getHeadSeq(chatContextType, contextId);
        const orderingSeq =
          (existing as { serverSyncSeq?: number | null }).serverSyncSeq ?? headSeq;
        (existing as { syncSeq?: number; _deduped?: boolean }).syncSeq = orderingSeq;
        (existing as { _deduped?: boolean })._deduped = true;
        return existing as any;
      }
    }

    let result: { message: any; syncSeq: number };
    try {
      result = await prisma.$transaction(async (tx) => {
      // 1. Create the message
      const message = await tx.chatMessage.create({
        data: {
          chatContextType,
          contextId,
          gameId: chatContextType === 'GAME' ? contextId : null,
          senderId,
          content: contentForStore,
          contentSearchable: contentSearchableValue,
          mediaUrls,
          thumbnailUrls,
          replyToId,
          chatType,
          mentionIds: mentionIds || [],
          state: MessageState.SENT,
          messageType: resolvedMessageType,
          audioDurationMs: resolvedMessageType === MessageType.VOICE ? audioDurationMs ?? null : null,
          waveformData: resolvedMessageType === MessageType.VOICE ? voiceWaveform : [],
          clientMutationId: cid ?? undefined,
        } as any,
        include: this.getMessageInclude()
      }) as any;

      let finalMessage = message;

      if (poll) {
        const createdPoll = await tx.poll.create({
          data: {
            messageId: message.id,
            question: poll.question,
            type: poll.type,
            isAnonymous: poll.isAnonymous,
            allowsMultipleAnswers: poll.allowsMultipleAnswers,
            options: {
              create: poll.options.map((option, index) => ({
                text: option,
                order: index,
                isCorrect: poll.type === 'QUIZ' ? index === poll.quizCorrectOptionIndex : false
              }))
            }
          }
        });

        await tx.chatMessage.update({
          where: { id: message.id },
          data: {
            pollId: createdPoll.id,
            contentSearchable: computeContentSearchable(message.content ?? null, poll.question)
          }
        });

        finalMessage = (await tx.chatMessage.findUnique({
          where: { id: message.id },
          include: this.getMessageInclude()
        })) as any;
      }

      const syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        chatContextType,
        contextId,
        ChatSyncEventType.MESSAGE_CREATED,
        { message: finalMessage }
      );
      await tx.chatMessage.update({
        where: { id: finalMessage.id },
        data: { serverSyncSeq: syncSeq },
      });
      const withSeq = await tx.chatMessage.findUnique({
        where: { id: finalMessage.id },
        include: this.getMessageInclude(),
      });
      return { message: (withSeq ?? finalMessage) as any, syncSeq };
    });
    } catch (e) {
      if (cid && isPrismaUniqueViolation(e)) {
        const recovered = await prisma.chatMessage.findFirst({
          where: { senderId, clientMutationId: cid },
          include: this.getMessageInclude(),
        });
        if (
          recovered &&
          recovered.chatContextType === chatContextType &&
          recovered.contextId === contextId
        ) {
          const headSeq = await ChatSyncEventService.getHeadSeq(chatContextType, contextId);
          const orderingSeq = recovered.serverSyncSeq ?? headSeq;
          (recovered as { syncSeq?: number; _deduped?: boolean }).syncSeq = orderingSeq;
          (recovered as { _deduped?: boolean })._deduped = true;
          return recovered as any;
        }
      }
      throw e;
    }

    const message = result.message as typeof result.message & { syncSeq: number };
    (message as { syncSeq: number }).syncSeq = result.syncSeq;

    // Post-creation logic (notifications, counts, etc.)
    if (chatContextType === 'GAME' && game) {
      if (chatType === ChatType.PHOTOS && mediaUrls.length > 0 && resolvedMessageType === MessageType.IMAGE) {
        const currentGame = await prisma.game.findUnique({
          where: { id: contextId },
          select: { mainPhotoId: true }
        });

        const updateData: any = {
          photosCount: {
            increment: mediaUrls.length
          }
        };

        if (!currentGame?.mainPhotoId) {
          updateData.mainPhotoId = message.id;
        }

        await prisma.game.update({
          where: { id: contextId },
          data: updateData
        });

        // Emit game update to refresh photosCount
        try {
          const socketService = (global as any).socketService;
          if (socketService) {
            const fullGame = await GameReadService.getGameById(contextId, senderId);
            if (fullGame) {
              await socketService.emitGameUpdate(contextId, senderId, fullGame);
            }
          }
        } catch (error) {
          console.error('Failed to emit game update after photo upload:', error);
        }
      }

      const gameWithDetails = await prisma.game.findUnique({
        where: { id: contextId },
        include: {
          court: {
            include: {
              club: true
            }
          },
          club: true
        }
      });

      if (gameWithDetails && message.sender) {
        notificationService.sendGameChatNotification(message, gameWithDetails, message.sender, []).catch(error => {
          console.error('Failed to send notification:', error);
        });
      }
    } else if (chatContextType === 'BUG' && bug && message.sender) {
      notificationService.sendBugChatNotification(message, bug, message.sender, []).catch(error => {
        console.error('Failed to send notification:', error);
      });
    } else if (chatContextType === 'USER' && userChat && message.sender) {
      await UserChatService.updateChatTimestamp(contextId);

      const userChatWithUsers = await prisma.userChat.findUnique({
        where: { id: contextId },
        include: {
          user1: {
            select: {
              id: true,
              telegramId: true,
              language: true,
              firstName: true,
              lastName: true,
              currentCityId: true,
            }
          },
          user2: {
            select: {
              id: true,
              telegramId: true,
              language: true,
              firstName: true,
              lastName: true,
              currentCityId: true,
            }
          }
        }
      });

      if (userChatWithUsers) {
        notificationService.sendUserChatNotification(message, userChatWithUsers, message.sender).catch(error => {
          console.error('Failed to send notification:', error);
        });
      }
    } else if (chatContextType === 'GROUP' && groupChannel && message.sender) {
      notificationService.sendGroupChatNotification(message, groupChannel, message.sender, []).catch(error => {
        console.error('Failed to send notification:', error);
      });
    }

    try {
      await DraftService.deleteDraft(
        data.senderId,
        data.chatContextType,
        data.contextId,
        data.chatType
      );
    } catch (error) {
      console.error('Failed to delete draft in createMessage:', error);
    }

    await updateLastMessagePreview(chatContextType, contextId);
    return message;
  }

  static async createMessageWithEvent(data: {
    chatContextType: ChatContextType;
    contextId: string;
    senderId: string;
    content?: string;
    mediaUrls: string[];
    replyToId?: string;
    chatType: ChatType;
    mentionIds?: string[];
    messageType?: MessageType;
    audioDurationMs?: number | null;
    waveformData?: number[];
    poll?: {
      question: string;
      options: string[];
      type: PollType;
      isAnonymous: boolean;
      allowsMultipleAnswers: boolean;
      quizCorrectOptionIndex?: number;
    };
    clientMutationId?: string | null;
  }) {
    const message = await this.createMessage(data);

    if ((message as { _deduped?: boolean })._deduped) {
      return message;
    }

    const socketService = (global as any).socketService;
    if (socketService) {
      // Get recipients for delivery tracking
      const recipients: string[] = [];

      if (data.chatContextType === 'GAME') {
        const game = await prisma.game.findUnique({
          where: { id: data.contextId },
          include: {
            participants: {
              where: { userId: { not: data.senderId } }
            }
          }
        });
        if (game) {
          recipients.push(...game.participants.map(p => p.userId));
        }
      } else if (data.chatContextType === 'USER') {
        const userChat = await prisma.userChat.findUnique({
          where: { id: data.contextId }
        });
        if (userChat) {
          const recipientId = userChat.user1Id === data.senderId
            ? userChat.user2Id
            : userChat.user1Id;
          if (recipientId) recipients.push(recipientId);
        }
      } else if (data.chatContextType === 'BUG') {
        const bug = await prisma.bug.findUnique({
          where: { id: data.contextId },
          include: {
            participants: {
              where: { userId: { not: data.senderId } }
            }
          }
        });
        if (bug) {
          if (bug.senderId !== data.senderId) {
            recipients.push(bug.senderId);
          }
          recipients.push(...bug.participants.map(p => p.userId));

          const admins = await prisma.user.findMany({
            where: { isAdmin: true },
            select: { id: true }
          });
          admins.forEach(admin => {
            if (admin.id !== data.senderId && !recipients.includes(admin.id)) {
              recipients.push(admin.id);
            }
          });
        }
      } else if (data.chatContextType === 'GROUP') {
        const groupChannel = await prisma.groupChannel.findUnique({
          where: { id: data.contextId },
          include: {
            participants: {
              where: { userId: { not: data.senderId } }
            }
          }
        });
        if (groupChannel) {
          recipients.push(...groupChannel.participants.map(p => p.userId));
        }
      }

      // Record delivery attempt
      if (recipients.length > 0) {
        socketService.recordMessageDelivery(
          message.id,
          data.chatContextType,
          data.contextId,
          recipients
        );
      }

      // Enrich message with all existing translations before emitting
      const allTranslations = await prisma.messageTranslation.findMany({
        where: { messageId: message.id },
        select: {
          languageCode: true,
          translation: true
        }
      });

      const translationsArray = allTranslations.length > 0 ? allTranslations.map(t => ({
        languageCode: t.languageCode,
        translation: t.translation
      })) : undefined;

      // Get sender's language to include as primary translation if available
      const sender = await prisma.user.findUnique({
        where: { id: data.senderId },
        select: { language: true }
      });
      const senderLanguageCode = sender ? TranslationService.extractLanguageCode(sender.language) : 'en';
      const senderTranslation = translationsArray?.find(t => t.languageCode === senderLanguageCode);

      const trRow = await prisma.messageTranscription.findUnique({
        where: { messageId: message.id },
        select: { transcription: true, languageCode: true },
      });
      const audioTranscription =
        trRow &&
        trRow.transcription &&
        trRow.transcription !== MESSAGE_TRANSCRIPTION_PENDING
          ? { transcription: trRow.transcription, languageCode: trRow.languageCode }
          : undefined;

      const messageWithTranslations = {
        ...message,
        translation: senderTranslation || (translationsArray && translationsArray.length > 0 ? translationsArray[0] : undefined),
        translations: translationsArray,
        audioTranscription,
      };

      const syncSeq = (message as { syncSeq?: number }).syncSeq;

      socketService.emitChatEvent(
        data.chatContextType,
        data.contextId,
        'message',
        { message: messageWithTranslations },
        message.id,
        syncSeq
      );

      // Emit unread count updates immediately to all recipients (not just undelivered)
      // This ensures badge updates even when users are not in the room
      // Filter out muted users for GROUP channels
      if (recipients.length > 0) {
        setTimeout(async () => {
          for (const userId of recipients) {
            try {
              // Skip muted users for GROUP channels
              if (data.chatContextType === 'GROUP') {
                const isMuted = await ChatMuteService.isChatMuted(userId, 'GROUP', data.contextId);
                if (isMuted) {
                  continue;
                }
              }

              const unreadCount = await ReadReceiptService.getUnreadCountForContext(
                data.chatContextType,
                data.contextId,
                userId
              );
              await socketService.emitUnreadCountUpdate(
                data.chatContextType,
                data.contextId,
                userId,
                unreadCount
              );
            } catch (error) {
              console.error(`[MessageService] Failed to emit unread count update for user ${userId}:`, error);
            }
          }
        }, 500); // Small delay to ensure message is saved
      }

      // Check for undelivered recipients after a delay
      if (recipients.length > 0) {
        setTimeout(async () => {
          const undelivered = socketService.getUndeliveredRecipients(message.id);

          for (const userId of undelivered) {
            const isOnline = socketService.isUserOnline(userId);
            const isInRoom = await socketService.isUserInChatRoom(
              data.chatContextType,
              data.contextId,
              userId
            );

            // If user is online but not in room, they might have missed it
            // Push notification should already be sent by notification service
            if (isOnline && !isInRoom) {
              console.log(`[MessageService] User ${userId} is online but not in room for message ${message.id}`);
            }
          }
        }, 2000); // Wait 2 seconds for socket delivery
      }
    }

    return message;
  }

  static async getMessages(
    chatContextType: ChatContextType,
    contextId: string,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      chatType?: ChatType;
      beforeMessageId?: string;
    }
  ) {
    const { page = 1, limit = 50, chatType = ChatType.PUBLIC, beforeMessageId } = options;

    if (chatContextType === 'GAME') {
      const { participant, game } = await this.validateGameAccess(contextId, userId);
      await this.validateChatTypeAccess(participant, chatType, game, userId, contextId, false);
    } else if (chatContextType === 'BUG') {
      await this.validateBugAccess(contextId, userId);
    } else if (chatContextType === 'USER') {
      await this.validateUserChatAccess(contextId, userId);
    } else if (chatContextType === 'GROUP') {
      await this.validateGroupChannelAccess(contextId, userId);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';

    if (beforeMessageId) {
      const beforeMessage = await prisma.chatMessage.findFirst({
        where: {
          id: beforeMessageId,
          chatContextType,
          contextId,
          chatType: chatType as ChatType,
          deletedAt: null,
        },
        select: { createdAt: true }
      });
      if (!beforeMessage) {
        return [];
      }
      const messages = await prisma.chatMessage.findMany({
        where: {
          chatContextType,
          contextId,
          chatType: chatType as ChatType,
          deletedAt: null,
          createdAt: { lt: beforeMessage.createdAt }
        },
        include: this.getMessageInclude(),
        orderBy: { createdAt: 'desc' },
        take: Number(limit)
      });
      const withTranslation = await this.enrichMessagesWithTranslations(messages, languageCode);
      return withTranslation.reverse();
    }

    const skip = (Number(page) - 1) * Number(limit);
    const messages = await prisma.chatMessage.findMany({
      where: {
        chatContextType,
        contextId,
        chatType: chatType as ChatType,
        deletedAt: null,
      },
      include: this.getMessageInclude(),
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    const messagesWithTranslation = await this.enrichMessagesWithTranslations(messages, languageCode);
    return messagesWithTranslation.reverse();
  }

  static async getMessageById(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
      include: this.getMessageInclude(),
    });
    if (!message) {
      throw new ApiError(404, 'Message not found');
    }
    await this.validateMessageAccess(message, userId, false);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';
    const [enriched] = await this.enrichMessagesWithTranslations([message], languageCode);
    return enriched;
  }

  static async getMissedMessages(
    chatContextType: ChatContextType,
    contextId: string,
    userId: string,
    lastMessageId?: string | null,
    gameChatType?: ChatType | null
  ) {
    if (chatContextType === 'GAME') {
      await this.validateGameAccess(contextId, userId);
    } else if (chatContextType === 'BUG') {
      await this.validateBugAccess(contextId, userId);
    } else if (chatContextType === 'USER') {
      await this.validateUserChatAccess(contextId, userId);
    } else if (chatContextType === 'GROUP') {
      await this.validateGroupChannelAccess(contextId, userId);
    }

    const baseWhere: Prisma.ChatMessageWhereInput = {
      chatContextType,
      contextId,
      deletedAt: null,
    };
    if (chatContextType === 'GAME' && gameChatType != null) {
      baseWhere.chatType = gameChatType;
    }

    const PAGE = 500;
    const MAX_PAGES = 40;
    const all: Awaited<ReturnType<typeof prisma.chatMessage.findMany>> = [];

    let cursorId: string | undefined = lastMessageId ?? undefined;

    if (lastMessageId) {
      const anchor0Where: Prisma.ChatMessageWhereInput = {
        id: lastMessageId,
        chatContextType,
        contextId,
        deletedAt: null,
      };
      if (chatContextType === 'GAME' && gameChatType != null) {
        anchor0Where.chatType = gameChatType;
      }
      const anchor0 = await prisma.chatMessage.findFirst({
        where: anchor0Where,
        select: { id: true },
      });
      if (!anchor0) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { language: true },
        });
        const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';
        return this.enrichMessagesWithTranslations([], languageCode);
      }
    }

    for (let page = 0; page < MAX_PAGES; page++) {
      const where: Prisma.ChatMessageWhereInput = { ...baseWhere };
      if (cursorId) {
        const anchorWhere: Prisma.ChatMessageWhereInput = {
          id: cursorId,
          chatContextType,
          contextId,
          deletedAt: null,
        };
        if (chatContextType === 'GAME' && gameChatType != null) {
          anchorWhere.chatType = gameChatType;
        }
        const anchor = await prisma.chatMessage.findFirst({
          where: anchorWhere,
          select: { createdAt: true, id: true },
        });
        if (!anchor) break;
        where.AND = [
          {
            OR: [
              { createdAt: { gt: anchor.createdAt } },
              { AND: [{ createdAt: anchor.createdAt }, { id: { gt: anchor.id } }] },
            ],
          },
        ];
      }

      const batch = await prisma.chatMessage.findMany({
        where,
        include: this.getMessageInclude(),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: PAGE,
      });

      if (batch.length === 0) break;
      all.push(...batch);
      if (batch.length < PAGE) break;
      cursorId = batch[batch.length - 1]!.id;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';
    return this.enrichMessagesWithTranslations(all, languageCode);
  }

  static async updateMessageContent(
    messageId: string,
    userId: string,
    data: { content: string; mentionIds?: string[] }
  ) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { poll: { select: { question: true } } }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.deletedAt) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only edit your own messages');
    }

    if (message.messageType === MessageType.VOICE) {
      throw new ApiError(400, 'Voice messages cannot be edited');
    }

    await this.validateMessageAccess(message, userId, true);

    const content = (data.content ?? '').trim();
    if (!content) {
      throw new ApiError(400, 'Content cannot be empty');
    }

    const mentionIds = Array.isArray(data.mentionIds) ? data.mentionIds : message.mentionIds;
    const contentSearchable = computeContentSearchable(content, message.poll?.question);

    const { updated, syncSeq } = await prisma.$transaction(async (tx) => {
      const u = await tx.chatMessage.update({
        where: { id: messageId },
        data: {
          content,
          mentionIds,
          contentSearchable,
          editedAt: new Date()
        },
        include: this.getMessageInclude()
      });
      const seq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        u.chatContextType,
        u.contextId,
        ChatSyncEventType.MESSAGE_UPDATED,
        chatSyncMessageUpdatedCompactPayload({
          id: u.id,
          content: u.content,
          mentionIds: u.mentionIds,
          editedAt: u.editedAt,
          updatedAt: u.updatedAt,
        })
      );
      await tx.chatMessage.update({
        where: { id: messageId },
        data: { serverSyncSeq: seq },
      });
      const fresh = await tx.chatMessage.findUnique({
        where: { id: messageId },
        include: this.getMessageInclude(),
      });
      return { updated: (fresh ?? u) as typeof u, syncSeq: seq };
    });

    await updateLastMessagePreview(message.chatContextType, message.contextId);
    (updated as { syncSeq?: number }).syncSeq = syncSeq;
    return updated;
  }

  static async updateMessageState(messageId: string, userId: string, state: MessageState) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.deletedAt) {
      throw new ApiError(404, 'Message not found');
    }

    await this.validateMessageAccess(message, userId, true);

    const { updated, syncSeq } = await prisma.$transaction(async (tx) => {
      const u = await tx.chatMessage.update({
        where: { id: messageId },
        data: { state },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              level: true,
              gender: true,
            }
          },
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  level: true,
                  gender: true
                }
              }
            }
          }
        }
      });
      const seq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        u.chatContextType,
        u.contextId,
        ChatSyncEventType.MESSAGE_STATE_UPDATED,
        { messageId: u.id, state: u.state }
      );
      await tx.chatMessage.update({
        where: { id: messageId },
        data: { serverSyncSeq: seq },
      });
      const fresh = await tx.chatMessage.findUnique({
        where: { id: messageId },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              level: true,
              gender: true,
            }
          },
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  level: true,
                  gender: true
                }
              }
            }
          }
        },
      });
      return { updated: (fresh ?? u) as typeof u, syncSeq: seq };
    });

    (updated as { syncSeq?: number }).syncSeq = syncSeq;
    return updated;
  }

  /**
   * After confirm-receipt (socket/push), promote SENT → DELIVERED when delivery policy is met.
   * USER / GAME / BUG: every listed recipient must have acked.
   * GROUP: first ack from any recipient is enough (avoids huge channels never reaching “delivered”).
   */
  static async tryPromoteToDeliveredWhenRecipientsAcked(
    messageId: string,
    contextType: ChatContextType,
    recipients: string[],
    socketDelivered: ReadonlySet<string>,
    pushDelivered: ReadonlySet<string>
  ): Promise<void> {
    if (recipients.length === 0) return;

    const acked = (uid: string) => socketDelivered.has(uid) || pushDelivered.has(uid);
    const satisfied =
      contextType === ChatContextType.GROUP
        ? recipients.some(acked)
        : recipients.every(acked);

    if (!satisfied) return;

    try {
      const { updated, syncSeq } = await prisma.$transaction(async (tx) => {
        const cur = await tx.chatMessage.findUnique({
          where: { id: messageId },
          select: {
            id: true,
            state: true,
            deletedAt: true,
            chatContextType: true,
            contextId: true,
          },
        });
        if (!cur || cur.deletedAt || cur.state !== MessageState.SENT) {
          return { updated: null, syncSeq: undefined as number | undefined };
        }

        await tx.chatMessage.update({
          where: { id: messageId },
          data: { state: MessageState.DELIVERED },
        });

        const seq = await ChatSyncEventService.appendEventInTransaction(
          tx,
          cur.chatContextType,
          cur.contextId,
          ChatSyncEventType.MESSAGE_STATE_UPDATED,
          { messageId, state: MessageState.DELIVERED }
        );

        await tx.chatMessage.update({
          where: { id: messageId },
          data: { serverSyncSeq: seq },
        });

        const fresh = await tx.chatMessage.findUnique({
          where: { id: messageId },
          include: this.getMessageInclude(),
        });
        return { updated: fresh, syncSeq: seq };
      });

      if (!updated) return;

      (updated as { syncSeq?: number }).syncSeq = syncSeq;

      const socketService = (global as any).socketService;
      if (socketService) {
        socketService.emitChatEvent(
          updated.chatContextType,
          updated.contextId,
          'message-updated',
          { message: updated },
          updated.id,
          syncSeq
        );
      }
    } catch (e) {
      console.error('[MessageService] tryPromoteToDeliveredWhenRecipientsAcked', e);
    }
  }

  static async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.deletedAt) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only delete your own messages');
    }

    await this.validateMessageAccess(message, userId, true);

    const deletedAt = new Date();
    const deletedIso = deletedAt.toISOString();

    const softDeleted = await prisma.$transaction(async (tx) => {
      const syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        message.chatContextType,
        message.contextId,
        ChatSyncEventType.MESSAGE_DELETED,
        { messageId, deletedAt: deletedIso }
      );

      const row = await tx.chatMessage.update({
        where: { id: messageId },
        data: { deletedAt, serverSyncSeq: syncSeq },
      });

      if (message.chatContextType === 'GAME' && message.chatType === ChatType.PHOTOS && message.mediaUrls.length > 0) {
        const currentGame = await tx.game.findUnique({
          where: { id: message.contextId },
          select: { mainPhotoId: true },
        });

        const updateData: Record<string, unknown> = {
          photosCount: {
            decrement: message.mediaUrls.length,
          },
        };

        if (currentGame?.mainPhotoId === messageId) {
          const remainingPhotos = await tx.chatMessage.findFirst({
            where: {
              contextId: message.contextId,
              chatType: ChatType.PHOTOS,
              mediaUrls: { isEmpty: false },
              id: { not: messageId },
              deletedAt: null,
            },
            orderBy: { createdAt: 'asc' },
          });

          updateData.mainPhotoId = remainingPhotos?.id || null;
        }

        await tx.game.update({
          where: { id: message.contextId },
          data: updateData as any,
        });
      }

      (row as { syncSeq?: number }).syncSeq = syncSeq;
      return row;
    });

    await updateLastMessagePreview(message.chatContextType, message.contextId);

    if (message.mediaUrls && message.mediaUrls.length > 0) {
      for (const mediaUrl of message.mediaUrls) {
        try {
          await ImageProcessor.deleteFile(mediaUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    if (message.thumbnailUrls && message.thumbnailUrls.length > 0) {
      for (const thumbnailUrl of message.thumbnailUrls) {
        try {
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting thumbnail file ${thumbnailUrl}:`, error);
        }
      }
    }

    if (message.chatContextType === 'GAME' && message.chatType === ChatType.PHOTOS && message.mediaUrls.length > 0) {
      try {
        const socketService = (global as any).socketService;
        if (socketService) {
          const fullGame = await GameReadService.getGameById(message.contextId, userId);
          if (fullGame) {
            await socketService.emitGameUpdate(message.contextId, userId, fullGame);
          }
        }
      } catch (error) {
        console.error('Failed to emit game update after photo deletion:', error);
      }
    }

    return softDeleted;
  }

  static async getUserChatGames(userId: string) {
    const games = await prisma.game.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true
              }
            }
          }
        },
        court: {
          include: {
            club: {
              select: {
                name: true,
                city: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        },
        leagueSeason: {
          include: {
            league: {
              select: {
                id: true,
                name: true,
              },
            },
            game: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        leagueGroup: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        leagueRound: {
          select: {
            id: true,
            orderIndex: true,
            roundType: true,
          },
        },
        parent: {
          include: {
            leagueSeason: {
              include: {
                league: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                game: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        startTime: 'desc'
      }
    });

    return games.map((game) => ({
      ...game,
      lastMessage: game.lastMessagePreview
        ? { preview: game.lastMessagePreview, updatedAt: game.updatedAt }
        : null
    }));
  }
}

