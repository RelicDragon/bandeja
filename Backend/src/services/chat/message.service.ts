import prisma from '../../config/database';
import { MessageState, ChatType, ChatContextType, ParticipantRole, PollType, Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import notificationService from '../notification.service';
import { GameReadService } from '../game/read.service';
import { UserChatService } from './userChat.service';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { TranslationService } from './translation.service';
import { ReadReceiptService } from './readReceipt.service';
import { DraftService } from './draft.service';
import { ChatMuteService } from './chatMute.service';
import { updateLastMessagePreview } from './lastMessagePreview.service';
import { computeContentSearchable } from '../../utils/messageSearchContent';

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
    const userChat = await prisma.userChat.findUnique({
      where: { id: userChatId },
      include: { user1: true, user2: true }
    });

    if (!userChat) {
      throw new ApiError(404, 'Chat not found');
    }

    if (userChat.user1Id !== userId && userChat.user2Id !== userId) {
      throw new ApiError(403, 'You are not a participant in this chat');
    }

    if (requireSendPermission) {
      if (userChat.user1Id === userId && !userChat.user2allowed) {
        throw new ApiError(403, 'Cannot send message - user has not allowed messages');
      }
      if (userChat.user2Id === userId && !userChat.user1allowed) {
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

    return messages.map(message => {
      const translation = translationMap.get(message.id);
      let sanitized = {
        ...message,
        translation: translation ? {
          languageCode: translation.languageCode,
          translation: translation.translation
        } : undefined
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
    poll?: {
      question: string;
      options: string[];
      type: PollType;
      isAnonymous: boolean;
      allowsMultipleAnswers: boolean;
      quizCorrectOptionIndex?: number;
    };
  }) {
    const { chatContextType, contextId, senderId, content, mediaUrls, replyToId, chatType, mentionIds = [], poll } = data;

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
          contextId
        }
      });

      if (!replyToMessage) {
        throw new ApiError(404, 'Reply message not found');
      }
    }

    const thumbnailUrls = this.generateThumbnailUrls(mediaUrls);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the message
      const message = await tx.chatMessage.create({
        data: {
          chatContextType,
          contextId,
          gameId: chatContextType === 'GAME' ? contextId : null,
          senderId,
          content: content?.startsWith('[TYPE:') ? content.substring(1) : (content ?? ''),
          contentSearchable: computeContentSearchable(content ?? null, poll?.question),
          mediaUrls,
          thumbnailUrls,
          replyToId,
          chatType,
          mentionIds: mentionIds || [],
          state: MessageState.SENT
        } as any,
        include: this.getMessageInclude()
      }) as any;

      // 2. If it's a poll, create the poll and link it back
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

        // Return the refetched message with all relations
        return await tx.chatMessage.findUnique({
          where: { id: message.id },
          include: this.getMessageInclude()
        });
      }

      return message;
    });

    const message = result;

    // Post-creation logic (notifications, counts, etc.)
    if (chatContextType === 'GAME' && game) {
      if (chatType === ChatType.PHOTOS && mediaUrls.length > 0) {
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
    poll?: {
      question: string;
      options: string[];
      type: PollType;
      isAnonymous: boolean;
      allowsMultipleAnswers: boolean;
      quizCorrectOptionIndex?: number;
    };
  }) {
    const message = await this.createMessage(data);

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

      const messageWithTranslations = {
        ...message,
        translation: senderTranslation || (translationsArray && translationsArray.length > 0 ? translationsArray[0] : undefined),
        translations: translationsArray
      };

      // NEW unified event with messageId for acknowledgment
      socketService.emitChatEvent(
        data.chatContextType,
        data.contextId,
        'message',
        { message: messageWithTranslations },
        message.id
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

    try {
      await DraftService.deleteDraft(
        data.senderId,
        data.chatContextType,
        data.contextId,
        data.chatType
      );
    } catch (error) {
      console.error('Failed to delete draft in createMessageWithEvent:', error);
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
    }
  ) {
    const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = options;

    // Validate access based on context type
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

    const skip = (Number(page) - 1) * Number(limit);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });

    const languageCode = user ? TranslationService.extractLanguageCode(user.language) : 'en';

    const messages = await prisma.chatMessage.findMany({
      where: {
        chatContextType,
        contextId,
        chatType: chatType as ChatType
      },
      include: this.getMessageInclude(),
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    const messagesWithTranslation = await this.enrichMessagesWithTranslations(messages, languageCode);

    return messagesWithTranslation.reverse();
  }

  static async updateMessageState(messageId: string, userId: string, state: MessageState) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    await this.validateMessageAccess(message, userId, true);

    return await prisma.chatMessage.update({
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
  }

  static async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only delete your own messages');
    }

    await this.validateMessageAccess(message, userId, true);

    if (message.mediaUrls && message.mediaUrls.length > 0) {
      const { ImageProcessor } = await import('../../utils/imageProcessor');
      for (const mediaUrl of message.mediaUrls) {
        try {
          await ImageProcessor.deleteFile(mediaUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    if (message.thumbnailUrls && message.thumbnailUrls.length > 0) {
      const { ImageProcessor } = await import('../../utils/imageProcessor');
      for (const thumbnailUrl of message.thumbnailUrls) {
        try {
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting thumbnail file ${thumbnailUrl}:`, error);
        }
      }
    }

    await prisma.chatMessage.delete({
      where: { id: messageId }
    });

    await updateLastMessagePreview(message.chatContextType, message.contextId);

    // Handle game-specific photo count update
    if (message.chatContextType === 'GAME' && message.chatType === ChatType.PHOTOS && message.mediaUrls.length > 0) {
      const currentGame = await prisma.game.findUnique({
        where: { id: message.contextId },
        select: { mainPhotoId: true }
      });

      const updateData: any = {
        photosCount: {
          decrement: message.mediaUrls.length
        }
      };

      if (currentGame?.mainPhotoId === messageId) {
        const remainingPhotos = await prisma.chatMessage.findFirst({
          where: {
            contextId: message.contextId,
            chatType: ChatType.PHOTOS,
            mediaUrls: { isEmpty: false },
            id: { not: messageId }
          },
          orderBy: { createdAt: 'asc' }
        });

        updateData.mainPhotoId = remainingPhotos?.id || null;
      }

      await prisma.game.update({
        where: { id: message.contextId },
        data: updateData
      });

      // Emit game update to refresh photosCount
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

    return message;
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

