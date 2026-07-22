import prisma from '../../config/database';
import {
  ChatSyncEventType,
  MESSAGE_TRANSLATION_PENDING,
  MESSAGE_TRANSCRIPTION_PENDING,
} from '@bandeja/chat-contract';
import {
  MessageState,
  ChatType,
  ChatContextType,
  ParticipantRole,
  PollType,
  Prisma,
  MessageType,
} from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { GameChatViewerAccessService } from './gameChatViewerAccess.service';
import { USER_SELECT_FIELDS, USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { resolveChatMessageSport } from '../user/userSportProfile.service';
import { projectMessageEmbeddedUsers, projectMessagesEmbeddedUsers } from '../user/projectEmbeddedBasicUsers';
import notificationService from '../notification.service';
import { UserChatService } from './userChat.service';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { TranslationService } from './translation.service';
import { translationEqualsSource } from './translationOutputNormalize';
import { ReadReceiptService } from './readReceipt.service';
import { DraftService } from './draft.service';
import { invalidateBasicUsersAllowedCacheForMessage } from '../user/basicUsersForMessageAllowedCache';
import { updateLastMessagePreview } from './lastMessagePreview.service';
import { computeContentSearchable, computeVoiceContentSearchable } from '../../utils/messageSearchContent';
import { ImageProcessor } from '../../utils/imageProcessor';
import { S3Service } from '../s3.service';
import { config } from '../../config/env';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { normalizeChatClientMutationId } from '../../utils/chatClientMutationId';
import { chatSyncMessageUpdatedCompactPayload } from '../../utils/chatSyncMessageUpdatePayload';
import { lastMessageForUnreadListSocket } from '../../utils/chatListSocketPreview';
import { resolveOutgoingChatMessageType } from './resolveOutgoingChatMessageType';
import {
  MAX_VIDEO_DURATION_MS as VIDEO_MESSAGE_MAX_MS,
  MIN_VIDEO_DURATION_MS,
} from '../../constants/chatVideo';
import { getChatNotifier } from './chatNotifier';
import { scheduleMessageCreateUnreadNotify } from './messageCreateUnreadNotify.service';
import { hasStoryReplyPayload } from './storyReplySanitize';
import { validateStoryReplyForUserChatMessage } from './storyReplyValidate.service';
import {
  extractEligiblePreviewUrls,
  normalizeEligiblePreviewSelection,
  verifyLinkPreviewSnapshotToken,
  isPersistableLinkPreview,
  resolveLinkPreviewForOutgoingMessage,
} from '../linkPreview';
import {
  tryConsumeGiphyIngestRateLimit,
  detectGiphyUrlOnly,
  tryConvertGiphyPasteToImage,
} from '../giphyIngest';
import {
  assertSendableSticker,
  bumpStickerRecent,
  isStickerCatalogUrl,
} from '../stickers';

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

function isAllowedChatVideoMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  let key: string;
  try {
    key = S3Service.extractS3Key(url);
  } catch {
    return false;
  }
  if (!/^uploads\/chat\/videos\/[a-zA-Z0-9._-]+$/.test(key)) return false;
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

function isAllowedChatVideoThumbnailUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  let key: string;
  try {
    key = S3Service.extractS3Key(url);
  } catch {
    return false;
  }
  if (!/^uploads\/chat\/thumbnails\/[a-zA-Z0-9._-]+$/.test(key)) return false;
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

    if (!isSender && !isAdmin && !isParticipant) {
      throw new ApiError(
        403,
        requireWriteAccess ? 'You must join the chat to send messages' : 'Access denied to bug chat',
        true,
        { code: 'bug.accessDenied' }
      );
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

    throw new ApiError(403, 'Access denied');
  }

  static async validateMessageAccess(
    message: { chatContextType: string; contextId: string; chatType: ChatType },
    userId: string,
    requireWriteAccess: boolean = false
  ) {
    if (message.chatContextType === 'GAME') {
      if (requireWriteAccess) {
        await GameChatViewerAccessService.assertWritable(message.contextId, userId);
      }
      await GameChatViewerAccessService.assertReadable(message.contextId, userId, message.chatType);
      return;
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
        select: USER_SELECT_WITH_SPORT_PROFILES
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          messageType: true,
          mediaUrls: true,
          stickerId: true,
          stickerEmoji: true,
          audioDurationMs: true,
          videoDurationMs: true,
          sender: {
            select: USER_SELECT_WITH_SPORT_PROFILES
          }
        }
      },
      reactions: {
        include: {
          user: {
            select: USER_SELECT_WITH_SPORT_PROFILES
          }
        }
      },
      readReceipts: {
        include: {
          user: {
            select: USER_SELECT_WITH_SPORT_PROFILES
          }
        }
      },
      poll: {
        include: {
          options: {
            include: {
              votes: {
                include: {
                  user: { select: USER_SELECT_WITH_SPORT_PROFILES }
                }
              }
            },
            orderBy: {
              order: Prisma.SortOrder.asc
            }
          },
          votes: {
            include: {
              user: { select: USER_SELECT_WITH_SPORT_PROFILES }
            }
          }
        }
      }
    };
  }

  static async finalizeMessagesForClient(
    messages: any[],
    languageCode: string,
    chatContextType: ChatContextType,
    contextId: string,
    viewerUserId: string,
  ): Promise<any[]> {
    if (!messages.length) {
      return messages;
    }
    const sport = await resolveChatMessageSport({ chatContextType, contextId }, viewerUserId);
    const enriched = await this.enrichMessagesWithTranslations(messages, languageCode);
    return projectMessagesEmbeddedUsers(enriched, sport);
  }

  static async finalizeMessageForClient(
    message: any,
    languageCode: string,
    chatContextType: ChatContextType,
    contextId: string,
    viewerUserId: string,
  ): Promise<any> {
    const [finalized] = await this.finalizeMessagesForClient(
      [message],
      languageCode,
      chatContextType,
      contextId,
      viewerUserId,
    );
    return finalized;
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
      const sourceText =
        (message.content?.trim() || '') ||
        (audioTranscription?.transcription?.trim() || '');
      const translationPayload =
        translation &&
        (translation.translation === MESSAGE_TRANSLATION_PENDING ||
          !sourceText ||
          !translationEqualsSource(sourceText, translation.translation))
          ? {
              languageCode: translation.languageCode,
              translation: translation.translation,
            }
          : undefined;
      let sanitized = {
        ...rest,
        syncSeq: serverSyncSeq ?? (message as { syncSeq?: number }).syncSeq,
        translation: translationPayload,
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

  /** Sender composing in a thread implies read — keeps DB in sync when client mark-read is delayed. */
  static async markSenderContextReadAfterSend(
    chatContextType: ChatContextType,
    contextId: string,
    senderId: string,
    groupChannelId?: string | null
  ): Promise<void> {
    const { UnreadSnapshotService } = await import('./unreadSnapshot.service');
    let markContextType: 'GAME' | 'USER' | 'GROUP';
    let markContextId = contextId;

    if (chatContextType === 'GAME') {
      markContextType = 'GAME';
    } else if (chatContextType === 'USER') {
      markContextType = 'USER';
    } else if (chatContextType === 'GROUP') {
      markContextType = 'GROUP';
    } else if (chatContextType === 'BUG') {
      const channelId =
        groupChannelId ??
        (
          await prisma.bug.findUnique({
            where: { id: contextId },
            select: { groupChannel: { select: { id: true } } },
          })
        )?.groupChannel?.id;
      if (!channelId) return;
      markContextType = 'GROUP';
      markContextId = channelId;
    } else {
      return;
    }

    const unread = await ReadReceiptService.getUnreadCountForContext(
      markContextType,
      markContextId,
      senderId
    );
    if (unread === 0) return;

    try {
      await UnreadSnapshotService.markContextRead(senderId, {
        contextType: markContextType,
        contextId: markContextId,
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) return;
      throw err;
    }
  }

  private static scheduleSenderContextReadAfterSend(
    chatContextType: ChatContextType,
    contextId: string,
    senderId: string,
    groupChannelId?: string | null
  ): void {
    void MessageService.markSenderContextReadAfterSend(
      chatContextType,
      contextId,
      senderId,
      groupChannelId
    ).catch((err) => {
      if (err instanceof ApiError && err.statusCode === 403) return;
      console.error('[MessageService] markSenderContextReadAfterSend failed', err);
    });
  }

  static async createMessage(data: {
    chatContextType: ChatContextType;
    contextId: string;
    senderId: string;
    content?: string;
    mediaUrls: string[];
    thumbnailUrls?: string[];
    replyToId?: string;
    storyReply?: unknown;
    chatType: ChatType;
    mentionIds?: string[];
    messageType?: MessageType;
    stickerId?: string | null;
    audioDurationMs?: number | null;
    videoDurationMs?: number | null;
    videoWidth?: number | null;
    videoHeight?: number | null;
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
    linkPreviewDisabled?: boolean;
    linkPreviewUrl?: string | null;
    linkPreviewToken?: string | null;
  }) {
    const {
      chatContextType,
      contextId,
      senderId,
      content,
      mediaUrls,
      clientThumbnailUrls = [],
      replyToId,
      chatType,
      mentionIds = [],
      poll,
      messageType: requestedMessageType,
      stickerId: rawStickerId,
      audioDurationMs,
      videoDurationMs,
      videoWidth,
      videoHeight,
      waveformData,
      linkPreviewDisabled = false,
      linkPreviewUrl: requestedLinkPreviewUrl,
      linkPreviewToken,
    } = {
      ...data,
      clientThumbnailUrls: data.thumbnailUrls ?? [],
    };
    const requestedStickerId =
      typeof rawStickerId === 'string' && rawStickerId.trim() ? rawStickerId.trim() : null;

    const cid = normalizeChatClientMutationId(data.clientMutationId);

    // Validate access based on context type
    let game, participant, bug, userChat, groupChannel;

    if (chatContextType === 'GAME') {
      const access = await GameChatViewerAccessService.assertWritable(contextId, senderId);
      if (access.lifecycle !== 'active') {
        throw new ApiError(403, 'This chat is archived', true, { code: 'chat.threadArchived' });
      }
      game = access.game;
      participant = access.participant;
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

    if (replyToId && hasStoryReplyPayload(data.storyReply)) {
      throw new ApiError(400, 'Cannot combine message reply with story reply');
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

    if (hasStoryReplyPayload(data.storyReply) && chatContextType !== 'USER') {
      throw new ApiError(400, 'Story reply is only allowed in user chats');
    }

    const storyReply =
      chatContextType === 'USER' && hasStoryReplyPayload(data.storyReply)
        ? await validateStoryReplyForUserChatMessage(data.storyReply, senderId, userChat!)
        : null;

    // Dedupe before Giphy ingest so retries do not re-fetch / re-upload / burn rate limit.
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
        MessageService.scheduleSenderContextReadAfterSend(chatContextType, contextId, senderId);
        const sport = await resolveChatMessageSport(
          { chatContextType, contextId },
          senderId,
        );
        return projectMessageEmbeddedUsers(existing, sport) as typeof existing;
      }
    }

    // Mutable create payload — Giphy URL-only paste may re-host → IMAGE before type resolve.
    let workingContent = content;
    let workingMediaUrls = [...mediaUrls];
    let workingClientThumbnails = Array.isArray(clientThumbnailUrls)
      ? [...clientThumbnailUrls]
      : [];
    let resolvedStickerId: string | null = null;
    let resolvedStickerEmoji: string | null = null;

    if (
      (requestedMessageType === MessageType.STICKER || requestedStickerId) &&
      workingMediaUrls.length > 0
    ) {
      throw new ApiError(400, 'Sticker messages cannot include mediaUrls', true, {
        code: 'sticker.mediaConflict',
      });
    }

    if (requestedMessageType === MessageType.STICKER || requestedStickerId) {
      if (!requestedStickerId) {
        throw new ApiError(400, 'stickerId is required for sticker messages', true, {
          code: 'sticker.idRequired',
        });
      }
      if (poll) {
        throw new ApiError(400, 'Sticker messages cannot include a poll', true, {
          code: 'sticker.pollConflict',
        });
      }
      const sticker = await assertSendableSticker(requestedStickerId, senderId);
      resolvedStickerId = sticker.id;
      resolvedStickerEmoji = sticker.emoji;
      workingContent = '';
      workingMediaUrls = [];
      workingClientThumbnails = [];
    }

    const canTryGiphy =
      !poll &&
      !resolvedStickerId &&
      requestedMessageType !== MessageType.VOICE &&
      requestedMessageType !== MessageType.VIDEO &&
      workingMediaUrls.length === 0;

    let giphyUploaded: { mediaUrl: string; thumbnailUrl: string } | null = null;

    if (canTryGiphy) {
      const giphyUrl = detectGiphyUrlOnly(workingContent);
      if (giphyUrl && tryConsumeGiphyIngestRateLimit(senderId)) {
        const ingested = await tryConvertGiphyPasteToImage(giphyUrl);
        if (ingested) {
          giphyUploaded = ingested;
          workingMediaUrls = [ingested.mediaUrl];
          workingClientThumbnails = [ingested.thumbnailUrl];
          workingContent = '';
        }
      }
    }

    const resolvedMessageType = resolveOutgoingChatMessageType({
      poll,
      requestedMessageType,
      stickerId: resolvedStickerId,
      mediaUrls: workingMediaUrls,
    });

    if (poll && workingMediaUrls.length > 0) {
      throw new ApiError(400, 'Poll messages cannot include media');
    }

    let voiceWaveform: number[] = [];
    if (resolvedMessageType === MessageType.VOICE) {
      if (poll) {
        throw new ApiError(400, 'Voice messages cannot include a poll');
      }
      if (workingMediaUrls.length !== 1) {
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
      const url = workingMediaUrls[0];
      if (!url || !isAllowedChatVoiceMediaUrl(url)) {
        throw new ApiError(400, 'Invalid voice audio URL');
      }
      voiceWaveform = wf;
    } else if (requestedMessageType === MessageType.VOICE) {
      throw new ApiError(400, 'Invalid voice message payload');
    }

    let videoMeta: { durationMs: number; width?: number; height?: number } | null = null;
    if (resolvedMessageType === MessageType.VIDEO) {
      if (poll) {
        throw new ApiError(400, 'Video messages cannot include a poll');
      }
      if (workingMediaUrls.length !== 1) {
        throw new ApiError(400, 'Video message requires exactly one video URL');
      }
      if (
        videoDurationMs == null ||
        videoDurationMs < MIN_VIDEO_DURATION_MS ||
        videoDurationMs > VIDEO_MESSAGE_MAX_MS
      ) {
        throw new ApiError(400, 'Invalid video message duration');
      }
      const url = workingMediaUrls[0];
      if (!url || !isAllowedChatVideoMediaUrl(url)) {
        throw new ApiError(400, 'Invalid video URL');
      }
      const thumbs = workingClientThumbnails;
      if (thumbs.length !== 1 || !isAllowedChatVideoThumbnailUrl(thumbs[0]!)) {
        throw new ApiError(400, 'Video message requires a valid poster thumbnail URL');
      }
      videoMeta = {
        durationMs: videoDurationMs,
        width: videoWidth ?? undefined,
        height: videoHeight ?? undefined,
      };
    } else if (requestedMessageType === MessageType.VIDEO) {
      throw new ApiError(400, 'Invalid video message payload');
    }

    const thumbnailUrls =
      resolvedMessageType === MessageType.VOICE || resolvedMessageType === MessageType.STICKER
        ? []
        : resolvedMessageType === MessageType.VIDEO
          ? workingClientThumbnails.slice(0, 1)
          : workingClientThumbnails.length > 0
            ? workingClientThumbnails
            : this.generateThumbnailUrls(workingMediaUrls);

    const contentForStore =
      resolvedMessageType === MessageType.VOICE ||
      resolvedMessageType === MessageType.VIDEO ||
      resolvedMessageType === MessageType.STICKER
        ? ''
        : workingContent?.startsWith('[TYPE:')
          ? workingContent.substring(1)
          : (workingContent ?? '');

    const contentSearchableValue =
      resolvedMessageType === MessageType.VOICE && audioDurationMs != null
        ? computeVoiceContentSearchable(audioDurationMs)
        : resolvedMessageType === MessageType.STICKER
          ? (resolvedStickerEmoji ?? 'sticker')
          : computeContentSearchable(workingContent ?? null, poll?.question);

    let linkPreviewSnapshot: Awaited<ReturnType<typeof resolveLinkPreviewForOutgoingMessage>> = null;
    const eligiblePreviewUrls = extractEligiblePreviewUrls(contentForStore);
    const requestedPreviewUrl = normalizeEligiblePreviewSelection(
      requestedLinkPreviewUrl,
      eligiblePreviewUrls
    );
    const linkPreviewUrl =
      !linkPreviewDisabled && requestedPreviewUrl
        ? requestedPreviewUrl
        : !linkPreviewDisabled
          ? (eligiblePreviewUrls[0] ?? null)
          : null;
    if (
      !linkPreviewDisabled &&
      resolvedMessageType === MessageType.TEXT &&
      contentForStore &&
      !poll &&
      workingMediaUrls.length === 0
    ) {
      linkPreviewSnapshot = resolveLinkPreviewForOutgoingMessage(
        contentForStore,
        linkPreviewUrl
      );
      if (!linkPreviewSnapshot && linkPreviewToken && linkPreviewUrl) {
        const tokenPreview = verifyLinkPreviewSnapshotToken(linkPreviewToken);
        if (
          tokenPreview &&
          normalizeEligiblePreviewSelection(tokenPreview.url, [linkPreviewUrl]) ===
            linkPreviewUrl &&
          isPersistableLinkPreview(tokenPreview)
        ) {
          linkPreviewSnapshot = tokenPreview;
        }
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
          mediaUrls: workingMediaUrls,
          thumbnailUrls,
          replyToId,
          storyReply: storyReply ?? undefined,
          linkPreview: linkPreviewSnapshot ?? undefined,
          linkPreviewUrl,
          linkPreviewDisabled,
          chatType,
          mentionIds: mentionIds || [],
          state: MessageState.SENT,
          messageType: resolvedMessageType,
          stickerId: resolvedMessageType === MessageType.STICKER ? resolvedStickerId : null,
          stickerEmoji: resolvedMessageType === MessageType.STICKER ? resolvedStickerEmoji : null,
          audioDurationMs: resolvedMessageType === MessageType.VOICE ? audioDurationMs ?? null : null,
          videoDurationMs: resolvedMessageType === MessageType.VIDEO ? videoMeta?.durationMs ?? null : null,
          videoWidth: resolvedMessageType === MessageType.VIDEO ? videoMeta?.width ?? null : null,
          videoHeight: resolvedMessageType === MessageType.VIDEO ? videoMeta?.height ?? null : null,
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
      if (giphyUploaded) {
        void ImageProcessor.deleteFilePair(giphyUploaded.mediaUrl, giphyUploaded.thumbnailUrl).catch(
          (err) => console.warn('[giphyIngest] orphan cleanup failed', err)
        );
        giphyUploaded = null;
      }
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
          MessageService.scheduleSenderContextReadAfterSend(chatContextType, contextId, senderId);
          // Retries must still bump Recent (first attempt may have created the row then failed mid-bump).
          if (recovered.messageType === MessageType.STICKER && recovered.stickerId) {
            try {
              await bumpStickerRecent(senderId, recovered.stickerId);
            } catch (err) {
              console.error('[MessageService] bumpStickerRecent failed (dedupe)', err);
            }
          }
          return recovered as any;
        }
      }
      throw e;
    }

    const message = result.message as typeof result.message & { syncSeq: number };
    (message as { syncSeq: number }).syncSeq = result.syncSeq;

    if (resolvedMessageType === MessageType.STICKER && resolvedStickerId) {
      try {
        await bumpStickerRecent(senderId, resolvedStickerId);
      } catch (err) {
        console.error('[MessageService] bumpStickerRecent failed', err);
      }
    }

    // Post-creation logic (notifications, counts, etc.)
    if (chatContextType === 'GAME' && game) {
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

    MessageService.scheduleSenderContextReadAfterSend(
      chatContextType,
      contextId,
      senderId,
      groupChannel?.id
    );

    if (!(message as { _deduped?: boolean })._deduped) {
      const { ChatAutoTranslateEnqueueService } = await import('./chatAutoTranslateEnqueue.service');
      void ChatAutoTranslateEnqueueService.enqueueForMessage(message.id).catch((err) => {
        console.error('[auto-translate] enqueue failed', { messageId: message.id, err });
      });
    }

    const sport = await resolveChatMessageSport({ chatContextType, contextId }, senderId);
    return projectMessageEmbeddedUsers(message, sport);
  }

  static async createMessageWithEvent(data: {
    chatContextType: ChatContextType;
    contextId: string;
    senderId: string;
    content?: string;
    mediaUrls: string[];
    thumbnailUrls?: string[];
    replyToId?: string;
    storyReply?: unknown;
    chatType: ChatType;
    mentionIds?: string[];
    messageType?: MessageType;
    stickerId?: string | null;
    audioDurationMs?: number | null;
    videoDurationMs?: number | null;
    videoWidth?: number | null;
    videoHeight?: number | null;
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
    linkPreviewDisabled?: boolean;
    linkPreviewUrl?: string | null;
    linkPreviewToken?: string | null;
  }) {
    const message = await this.createMessage(data);

    if ((message as { _deduped?: boolean })._deduped) {
      return message;
    }

    const notifier = getChatNotifier();

    const recipients: string[] = [];
    let userDmNotifyIds: string[] | undefined;
    let bugGroupChannelId: string | undefined;

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
        userDmNotifyIds = [userChat.user1Id, userChat.user2Id].filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        );
        const recipientId = userChat.user1Id === data.senderId
          ? userChat.user2Id
          : userChat.user1Id;
        if (recipientId) recipients.push(recipientId);
      }
    } else if (data.chatContextType === 'BUG') {
      const bug = await prisma.bug.findUnique({
        where: { id: data.contextId },
        include: {
          groupChannel: { select: { id: true } },
          participants: {
            where: { userId: { not: data.senderId } }
          }
        }
      });
      if (bug) {
        bugGroupChannelId = bug.groupChannel?.id ?? undefined;
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

    if (recipients.length > 0) {
      notifier.recordMessageDelivery(
        message.id,
        data.chatContextType,
        data.contextId,
        recipients
      );
    }

    const allTranslations = await prisma.messageTranslation.findMany({
      where: { messageId: message.id },
      select: {
        languageCode: true,
        translation: true
      }
    });

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

    const emitSourceText =
      (message.content?.trim() || '') ||
      (audioTranscription?.transcription?.trim() || '');
    const translationsArray =
      allTranslations.length > 0
        ? allTranslations
            .filter(
              (t) =>
                t.translation === MESSAGE_TRANSLATION_PENDING ||
                !emitSourceText ||
                !translationEqualsSource(emitSourceText, t.translation)
            )
            .map((t) => ({
              languageCode: t.languageCode,
              translation: t.translation,
            }))
        : undefined;

    const sender = await prisma.user.findUnique({
      where: { id: data.senderId },
      select: { language: true }
    });
    const senderLanguageCode = sender ? TranslationService.extractLanguageCode(sender.language) : 'en';
    const senderTranslation = translationsArray?.find(t => t.languageCode === senderLanguageCode);

    const messageWithTranslations = {
      ...message,
      translation: senderTranslation || (translationsArray && translationsArray.length > 0 ? translationsArray[0] : undefined),
      translations: translationsArray,
      audioTranscription,
    };

    const syncSeq = (message as { syncSeq?: number }).syncSeq;

    notifier.emitChatEvent(
      data.chatContextType,
      data.contextId,
      'message',
      { message: messageWithTranslations },
      message.id,
      syncSeq,
      userDmNotifyIds
    );

    if (recipients.length > 0) {
      const listPreview =
        data.chatContextType === ChatContextType.USER ||
        data.chatContextType === ChatContextType.GROUP ||
        data.chatContextType === ChatContextType.GAME
          ? lastMessageForUnreadListSocket(messageWithTranslations)
          : undefined;
      scheduleMessageCreateUnreadNotify({
        chatContextType: data.chatContextType,
        contextId: data.contextId,
        senderId: data.senderId,
        recipientIds: recipients,
        lastMessage: listPreview,
        bugGroupChannelId,
      });
    }

    if (recipients.length > 0) {
      setTimeout(async () => {
        const undelivered = notifier.getUndeliveredRecipients(message.id);

        for (const userId of undelivered) {
          const isOnline = notifier.isUserOnline(userId);
          const isInRoom = await notifier.isUserInChatRoom(
            data.chatContextType,
            data.contextId,
            userId
          );

          if (isOnline && !isInRoom) {
            console.log(`[MessageService] User ${userId} is online but not in room for message ${message.id}`);
          }
        }
      }, 2000);
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
      await GameChatViewerAccessService.assertReadable(
        contextId,
        userId,
        chatType ?? undefined
      );
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
      const withTranslation = await this.finalizeMessagesForClient(
        messages,
        languageCode,
        chatContextType,
        contextId,
        userId,
      );
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

    const messagesWithTranslation = await this.finalizeMessagesForClient(
      messages,
      languageCode,
      chatContextType,
      contextId,
      userId,
    );
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
    return this.finalizeMessageForClient(
      message,
      languageCode,
      message.chatContextType,
      message.contextId,
      userId,
    );
  }

  /** Latest non-deleted message in context (any `chatType`), for list row previews. */
  static async getLatestMessageForListRowPreview(
    chatContextType: Extract<ChatContextType, 'GROUP' | 'USER'>,
    contextId: string,
    userId: string
  ) {
    if (chatContextType === 'GROUP') {
      await this.validateGroupChannelAccess(contextId, userId);
    } else {
      await this.validateUserChatAccess(contextId, userId);
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';
    const row = await prisma.chatMessage.findFirst({
      where: {
        chatContextType,
        contextId,
        deletedAt: null,
      },
      include: this.getMessageInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!row) return null;
    const [enriched] = await this.enrichMessagesWithTranslations([row], languageCode);
    return enriched ?? null;
  }

  static async getMissedMessages(
    chatContextType: ChatContextType,
    contextId: string,
    userId: string,
    lastMessageId?: string | null,
    gameChatType?: ChatType | null
  ): Promise<{
    messages: Awaited<ReturnType<typeof MessageService.enrichMessagesWithTranslations>>;
    threadInvalidated?: boolean;
  }> {
    if (chatContextType === 'GAME') {
      await GameChatViewerAccessService.assertReadable(
        contextId,
        userId,
        gameChatType ?? undefined
      );
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
        const STALE_TAIL_RECOVERY = 150;
        const recent = await prisma.chatMessage.findMany({
          where: baseWhere,
          include: this.getMessageInclude(),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: STALE_TAIL_RECOVERY,
        });
        recent.reverse();
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { language: true },
        });
        const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';
        return {
          messages: await this.enrichMessagesWithTranslations(recent, languageCode),
        };
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
    return {
      messages: await this.enrichMessagesWithTranslations(all, languageCode),
    };
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

    if (message.messageType === MessageType.VIDEO) {
      throw new ApiError(400, 'Video messages cannot be edited');
    }

    if (message.messageType === MessageType.STICKER) {
      throw new ApiError(400, 'Sticker messages cannot be edited');
    }

    await this.validateMessageAccess(message, userId, true);

    const content = (data.content ?? '').trim();
    if (!content) {
      throw new ApiError(400, 'Content cannot be empty');
    }

    const mentionIds = Array.isArray(data.mentionIds) ? data.mentionIds : message.mentionIds;
    const contentSearchable = computeContentSearchable(content, message.poll?.question);
    const eligiblePreviewUrls = extractEligiblePreviewUrls(content);
    const linkPreviewUrl = message.linkPreviewDisabled
      ? null
      : message.linkPreviewUrl && eligiblePreviewUrls.includes(message.linkPreviewUrl)
        ? message.linkPreviewUrl
        : (eligiblePreviewUrls[0] ?? null);
    const cachedLinkPreview = message.linkPreviewDisabled
      ? null
      : resolveLinkPreviewForOutgoingMessage(content, linkPreviewUrl);
    const linkPreview =
      cachedLinkPreview ??
      (linkPreviewUrl === message.linkPreviewUrl ? message.linkPreview : null);

    const { updated, syncSeq } = await prisma.$transaction(async (tx) => {
      const u = await tx.chatMessage.update({
        where: { id: messageId },
        data: {
          content,
          mentionIds,
          contentSearchable,
          linkPreviewUrl,
          linkPreview: linkPreview ?? Prisma.DbNull,
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
          linkPreviewDisabled: u.linkPreviewDisabled,
          linkPreviewUrl: u.linkPreviewUrl,
          linkPreview: u.linkPreview,
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

    const { ChatAutoTranslateEnqueueService } = await import('./chatAutoTranslateEnqueue.service');
    void ChatAutoTranslateEnqueueService.onMessageEdited(messageId).catch((err) => {
      console.error('[auto-translate] re-enqueue on edit failed', { messageId, err });
    });

    return updated;
  }

  static async updateMessageLinkPreview(
    messageId: string,
    userId: string,
    disabled: boolean
  ) {
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new ApiError(404, 'Message not found');
    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only change previews on your own messages');
    }
    await this.validateMessageAccess(message, userId, true);

    const { updated, syncSeq } = await prisma.$transaction(async (tx) => {
      const row = await tx.chatMessage.update({
        where: { id: messageId },
        data: { linkPreviewDisabled: disabled },
        include: this.getMessageInclude(),
      });
      const seq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        row.chatContextType,
        row.contextId,
        ChatSyncEventType.MESSAGE_UPDATED,
        chatSyncMessageUpdatedCompactPayload({
          id: row.id,
          content: row.content,
          mentionIds: row.mentionIds,
          editedAt: row.editedAt,
          updatedAt: row.updatedAt,
          linkPreviewDisabled: row.linkPreviewDisabled,
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
      return { updated: fresh ?? row, syncSeq: seq };
    });
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
            select: USER_SELECT_WITH_SPORT_PROFILES,
          },
          reactions: {
            include: {
              user: {
                select: USER_SELECT_WITH_SPORT_PROFILES,
              },
            },
          },
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
            select: USER_SELECT_WITH_SPORT_PROFILES,
          },
          reactions: {
            include: {
              user: {
                select: USER_SELECT_WITH_SPORT_PROFILES,
              },
            },
          },
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

      let notifyUserIds: string[] | undefined;
      if (updated.chatContextType === ChatContextType.USER) {
        const uc = await prisma.userChat.findUnique({
          where: { id: updated.contextId },
          select: { user1Id: true, user2Id: true },
        });
        if (uc) {
          const pair = [uc.user1Id, uc.user2Id].filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          );
          if (new Set(pair).size === 2) {
            notifyUserIds = pair;
          }
        }
      }

      getChatNotifier().emitChatEvent(
        updated.chatContextType,
        updated.contextId,
        'message-updated',
        { message: updated },
        updated.id,
        syncSeq,
        notifyUserIds
      );
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

      (row as { syncSeq?: number }).syncSeq = syncSeq;
      return row;
    });

    invalidateBasicUsersAllowedCacheForMessage(messageId);

    await updateLastMessagePreview(message.chatContextType, message.contextId);

    const skipMediaDelete =
      message.messageType === MessageType.STICKER ||
      (Array.isArray(message.mediaUrls) &&
        message.mediaUrls.some((u) => isStickerCatalogUrl(u)));

    if (!skipMediaDelete && message.mediaUrls && message.mediaUrls.length > 0) {
      for (const mediaUrl of message.mediaUrls) {
        if (isStickerCatalogUrl(mediaUrl)) continue;
        try {
          await ImageProcessor.deleteFile(mediaUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    if (!skipMediaDelete && message.thumbnailUrls && message.thumbnailUrls.length > 0) {
      for (const thumbnailUrl of message.thumbnailUrls) {
        if (isStickerCatalogUrl(thumbnailUrl)) continue;
        try {
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting thumbnail file ${thumbnailUrl}:`, error);
        }
      }
    }

    return softDeleted;
  }

  static async getUserChatGames(userId: string) {
    const games = await prisma.game.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        participants: {
          some: { userId },
        },
      },
      include: {
        city: {
          select: {
            id: true,
            name: true,
            country: true,
            timezone: true,
          },
        },
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
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
