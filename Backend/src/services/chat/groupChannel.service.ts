import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { createSystemMessage } from '../../controllers/chat.controller';
import { ChatContextType, ParticipantRole, InviteStatus, ChatType, Prisma, BugStatus, BugType } from '@prisma/client';
import { MessageService } from './message.service';

type GcWithParticipants = Awaited<ReturnType<typeof prisma.groupChannel.findMany>>[number] & {
  participants: Array<{ userId: string; role: ParticipantRole }>;
};

function mapGroupChannelToResponse(gc: GcWithParticipants, userId: string) {
  const userParticipant = gc.participants.find((p) => p.userId === userId);
  const isOwner = userParticipant?.role === ParticipantRole.OWNER;
  const isParticipant = !!userParticipant;
  return {
    ...gc,
    lastMessage: gc.lastMessagePreview
      ? { preview: gc.lastMessagePreview, updatedAt: gc.updatedAt }
      : null,
    isParticipant,
    isOwner
  };
}

export class GroupChannelService {
  static async getGroupChannelOwner(groupChannelId: string) {
    const owner = await prisma.groupChannelParticipant.findFirst({
      where: {
        groupChannelId,
        role: ParticipantRole.OWNER
      },
      include: {
        user: {
          select: USER_SELECT_FIELDS
        }
      }
    });
    return owner;
  }

  static async isGroupChannelOwner(groupChannelId: string, userId: string): Promise<boolean> {
    const participant = await prisma.groupChannelParticipant.findFirst({
      where: {
        groupChannelId,
        userId,
        role: ParticipantRole.OWNER
      }
    });
    return !!participant;
  }

  static async isGroupChannelAdminOrOwner(groupChannelId: string, userId: string): Promise<boolean> {
    const participant = await prisma.groupChannelParticipant.findFirst({
      where: {
        groupChannelId,
        userId,
        role: {
          in: [ParticipantRole.OWNER, ParticipantRole.ADMIN]
        }
      }
    });
    return !!participant;
  }
  static async createGroupChannel(data: {
    name: string;
    avatar?: string;
    isChannel: boolean;
    isPublic: boolean;
    ownerId: string;
  }) {
    let cityId: string | undefined;
    
    if (data.isChannel) {
      const owner = await prisma.user.findUnique({
        where: { id: data.ownerId },
        select: { currentCityId: true }
      });
      cityId = owner?.currentCityId || undefined;
    }

    const groupChannel = await prisma.groupChannel.create({
      data: {
        name: data.name,
        avatar: data.avatar,
        isChannel: data.isChannel,
        isPublic: data.isPublic,
        cityId: cityId,
        participantsCount: 1,
      }
    });

    await prisma.groupChannelParticipant.create({
      data: {
        groupChannelId: groupChannel.id,
        userId: data.ownerId,
        role: ParticipantRole.OWNER
      }
    });

    await MessageService.createMessage({
      chatContextType: ChatContextType.GROUP,
      contextId: groupChannel.id,
      senderId: data.ownerId,
      content: 'Group created',
      mediaUrls: [],
      chatType: ChatType.PUBLIC
    }).catch(error => {
      console.error('Failed to send "Group created" message:', error);
    });

    return groupChannel;
  }

  static async getGroupChannelById(groupChannelId: string, userId?: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId },
      include: {
        bug: {
          include: {
            sender: { select: USER_SELECT_FIELDS }
          }
        },
        marketItem: {
          include: {
            seller: { select: USER_SELECT_FIELDS },
            category: true,
            city: true
          }
        },
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS
            }
          }
        }
      }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const userParticipant = userId ? groupChannel.participants.find(p => p.userId === userId) : null;
    const isOwner = userParticipant?.role === ParticipantRole.OWNER;
    const isParticipant = !!userParticipant;

    return {
      ...groupChannel,
      isParticipant,
      isOwner
    };
  }

  static readonly PAGE_SIZE = 10;

  static async getGroupChannels(userId: string, filter?: 'users' | 'bugs' | 'channels' | 'market', opts?: {
    page?: number;
    limit?: number;
    status?: string[];
    bugType?: string[];
    myBugsOnly?: boolean;
    cityId?: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentCityId: true }
    });

    const userCityId = user?.currentCityId;

    const baseWhere: any = {
      OR: [
        {
          isChannel: false,
          participants: {
            some: {
              userId,
              hidden: false
            }
          }
        },
        {
          isChannel: true,
          cityId: userCityId,
          OR: [
            {
              participants: {
                some: {
                  userId,
                  hidden: false
                }
              }
            },
            { isPublic: true }
          ]
        }
      ]
    };

    if (filter === 'users') {
      baseWhere.OR = baseWhere.OR.filter((c: any) => c.isChannel === false);
    } else if (filter === 'bugs') {
      baseWhere.OR = [
        {
          isChannel: false,
          bugId: { not: null },
          OR: [
            { participants: { some: { userId, hidden: false } } },
            { isPublic: true }
          ]
        }
      ];
    } else if (filter === 'channels') {
      baseWhere.OR = [
        {
          isChannel: true,
          bugId: null,
          marketItemId: null,
          cityId: userCityId,
          OR: [
            {
              participants: {
                some: {
                  userId,
                  hidden: false
                }
              }
            },
            { isPublic: true }
          ]
        }
      ];
    } else if (filter === 'market') {
      const marketWhere: any = {
        isChannel: true,
        bugId: null,
        marketItemId: { not: null },
        OR: [
          { participants: { some: { userId, hidden: false } } },
          { isPublic: true }
        ]
      };
      if (opts?.cityId) {
        marketWhere.cityId = opts.cityId;
      } else if (userCityId) {
        marketWhere.cityId = userCityId;
      }
      baseWhere.OR = [marketWhere];
    }

    const isPaged = opts?.page != null && (filter === 'bugs' || filter === 'users' || filter === 'channels' || filter === 'market');
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? GroupChannelService.PAGE_SIZE;

    let groupChannels: Awaited<ReturnType<typeof prisma.groupChannel.findMany>>;

    if (filter === 'bugs' && isPaged) {
      const statusArr = opts?.status?.length ? opts.status : null;
      const bugTypeArr = opts?.bugType?.length ? opts.bugType : null;
      const myBugsOnly = opts?.myBugsOnly === true;
      const bugWhere: Prisma.BugWhereInput = {};
      if (statusArr?.length) {
        bugWhere.status = statusArr.length === 1 ? (statusArr[0] as BugStatus) : { in: statusArr as BugStatus[] };
      } else {
        bugWhere.status = { not: 'ARCHIVED' };
      }
      if (bugTypeArr?.length) {
        bugWhere.bugType = bugTypeArr.length === 1 ? (bugTypeArr[0] as BugType) : { in: bugTypeArr as BugType[] };
      }
      if (myBugsOnly) {
        bugWhere.senderId = userId;
      }
      const idsResult = await prisma.groupChannel.findMany({
        where: {
          isChannel: false,
          bugId: { not: null },
          OR: [
            { participants: { some: { userId, hidden: false } } },
            { isPublic: true }
          ],
          bug: bugWhere
        },
        select: { id: true },
        orderBy: [
          { bug: { bugType: 'asc' } },
          { bug: { status: 'asc' } }
        ],
        skip: (page - 1) * limit,
        take: limit
      });
      const orderedIds = idsResult.map((r) => r.id);
      if (orderedIds.length === 0) {
        const total = await prisma.groupChannel.count({
          where: {
            isChannel: false,
            bugId: { not: null },
            OR: [
              { participants: { some: { userId, hidden: false } } },
              { isPublic: true }
            ],
            bug: bugWhere
          }
        });
        return { data: [], pagination: { page, limit, total, hasMore: false } };
      }
      const channels = await prisma.groupChannel.findMany({
        where: { id: { in: orderedIds } },
        include: {
          bug: {
            include: {
              sender: { select: USER_SELECT_FIELDS }
            }
          },
          participants: {
            where: { userId },
            include: {
              user: {
                select: USER_SELECT_FIELDS
              }
            }
          }
        }
      });
      const idToIndex = new Map(orderedIds.map((id, i) => [id, i]));
      groupChannels = channels.sort((a, b) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0)) as typeof groupChannels;
    } else {
      const findManyOpts: Prisma.GroupChannelFindManyArgs = {
        where: baseWhere,
        include: {
          bug: {
            include: {
              sender: { select: USER_SELECT_FIELDS }
            }
          },
          marketItem: {
            include: {
              seller: { select: USER_SELECT_FIELDS },
              category: true,
              city: true
            }
          },
          participants: {
            where: { userId },
            include: {
              user: {
                select: USER_SELECT_FIELDS
              }
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      };
      if (isPaged && (filter === 'users' || filter === 'channels' || filter === 'market')) {
        findManyOpts.skip = (page - 1) * limit;
        findManyOpts.take = limit;
      }
      groupChannels = await prisma.groupChannel.findMany(findManyOpts);
    }

    const typedChannels = groupChannels as GcWithParticipants[];

    if (isPaged) {
      const hasBugFilters = filter === 'bugs' && (opts?.status?.length || opts?.bugType?.length || opts?.myBugsOnly);
      let total: number;
      if (hasBugFilters) {
        const statusArr = opts?.status?.length ? opts.status : null;
        const bugTypeArr = opts?.bugType?.length ? opts.bugType : null;
        const myBugsOnly = opts?.myBugsOnly === true;
        const bugWhere: Prisma.BugWhereInput = {};
        if (statusArr?.length) {
          bugWhere.status = statusArr.length === 1 ? (statusArr[0] as BugStatus) : { in: statusArr as BugStatus[] };
        } else {
          bugWhere.status = { not: 'ARCHIVED' };
        }
        if (bugTypeArr?.length) {
          bugWhere.bugType = bugTypeArr.length === 1 ? (bugTypeArr[0] as BugType) : { in: bugTypeArr as BugType[] };
        }
        if (myBugsOnly) {
          bugWhere.senderId = userId;
        }
        total = await prisma.groupChannel.count({
          where: {
            isChannel: false,
            bugId: { not: null },
            OR: [
              { participants: { some: { userId, hidden: false } } },
              { isPublic: true }
            ],
            bug: bugWhere
          }
        });
      } else {
        total = await prisma.groupChannel.count({ where: baseWhere });
      }
      const mapped = typedChannels.map((gc) => mapGroupChannelToResponse(gc, userId));
      return { data: mapped, pagination: { page, limit, total, hasMore: page * limit < total } };
    }

    return typedChannels.map((gc) => mapGroupChannelToResponse(gc, userId));
  }

  static async getPublicGroupChannels(userId?: string) {
    const groupChannels = await prisma.groupChannel.findMany({
      where: {
        isPublic: true
      },
      include: {
        participants: userId ? {
          where: { userId }
        } : undefined
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return groupChannels;
  }

  static async updateGroupChannel(
    groupChannelId: string,
    userId: string,
    data: {
      name?: string;
      avatar?: string;
      originalAvatar?: string;
      isChannel?: boolean;
      isPublic?: boolean;
    }
  ) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const isAdminOrOwner = await this.isGroupChannelAdminOrOwner(groupChannelId, userId);
    if (!isAdminOrOwner) {
      throw new ApiError(403, 'Only owner or admin can update group/channel');
    }

    const updated = await prisma.groupChannel.update({
      where: { id: groupChannelId },
      data
    });

    return updated;
  }

  static async deleteGroupChannel(groupChannelId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const isOwner = await this.isGroupChannelOwner(groupChannelId, userId);
    if (!isOwner) {
      throw new ApiError(403, 'Only owner can delete group/channel');
    }

    await prisma.groupChannel.delete({
      where: { id: groupChannelId }
    });

    return { success: true };
  }

  static async joinGroupChannel(groupChannelId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const isParticipant = await this.isParticipant(groupChannelId, userId);
    if (!groupChannel.isPublic && !isParticipant) {
      throw new ApiError(403, 'This is a private group/channel. You need an invitation.');
    }

    const existingParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    if (existingParticipant) {
      throw new ApiError(400, 'Already a participant');
    }

    await prisma.groupChannelParticipant.create({
      data: {
        groupChannelId,
        userId,
        role: ParticipantRole.PARTICIPANT
      }
    });

    await prisma.groupChannel.update({
      where: { id: groupChannelId },
      data: {
        participantsCount: {
          increment: 1
        }
      }
    });

    if (!groupChannel.isChannel) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: USER_SELECT_FIELDS,
      });

      if (user) {
        const userName = getUserDisplayName(user.firstName, user.lastName);
        await createSystemMessage(
          groupChannelId,
          {
            type: SystemMessageType.USER_JOINED_CHAT,
            variables: { userName }
          },
          undefined,
          ChatContextType.GROUP
        );
      }
    }

    return 'Successfully joined the group/channel';
  }

  static async leaveGroupChannel(groupChannelId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const participant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    if (!participant) {
      throw new ApiError(404, 'Not a participant');
    }

    if (participant.role === ParticipantRole.OWNER) {
      throw new ApiError(400, 'Owner cannot leave. Transfer ownership first.');
    }

    await prisma.groupChannelParticipant.delete({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    await prisma.groupChannel.update({
      where: { id: groupChannelId },
      data: {
        participantsCount: {
          decrement: 1
        }
      }
    });

    if (!groupChannel.isChannel) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: USER_SELECT_FIELDS,
      });

      if (user) {
        const userName = getUserDisplayName(user.firstName, user.lastName);
        await createSystemMessage(
          groupChannelId,
          {
            type: SystemMessageType.USER_LEFT_CHAT,
            variables: { userName }
          },
          undefined,
          ChatContextType.GROUP
        );
      }
    }

    return 'Successfully left the group/channel';
  }

  static async inviteUser(
    groupChannelId: string,
    senderId: string,
    receiverId: string,
    message?: string
  ) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const senderParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: senderId
        }
      }
    });

    if (!senderParticipant) {
      throw new ApiError(403, 'Only participants can invite users');
    }

    // Check if receiver is already a participant
    const existingParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: receiverId
        }
      }
    });

    if (existingParticipant) {
      throw new ApiError(400, 'User is already a participant');
    }

    // Check for existing pending invite
    const existingInvite = await prisma.groupChannelInvite.findFirst({
      where: {
        groupChannelId,
        receiverId,
        status: InviteStatus.PENDING
      }
    });

    if (existingInvite) {
      throw new ApiError(400, 'Invitation already sent');
    }

    const invite = await prisma.groupChannelInvite.create({
      data: {
        groupChannelId,
        senderId,
        receiverId,
        message,
        status: InviteStatus.PENDING
      },
      include: {
        sender: {
          select: USER_SELECT_FIELDS
        },
        receiver: {
          select: USER_SELECT_FIELDS
        },
        groupChannel: true
      }
    });

    // Send invitation message to user-chat
    try {
      const { UserChatService } = await import('./userChat.service');
      const { MessageService } = await import('./message.service');
      const { TranslationService } = await import('./translation.service');
      const { t } = await import('../../utils/translations');
      const { config } = await import('../../config/env');
      const { ChatType } = await import('@prisma/client');

      // Get or create user-chat between sender and receiver
      const userChat = await UserChatService.getOrCreateChatWithUser(senderId, receiverId);

      // Get receiver's language
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: { language: true }
      });

      const receiverLanguage = receiver?.language || 'en';
      const languageCode = TranslationService.extractLanguageCode(receiverLanguage);

      // Get sender display name
      const senderDisplayName = getUserDisplayName(invite.sender.firstName, invite.sender.lastName);

      // Build channel URL
      const channelUrl = `${config.frontendUrl}/group-chat/${groupChannelId}`;

      // Translate invitation message
      const inviteMessageTemplate = t('chat.channelInviteMessage', languageCode);
      const inviteMessage = inviteMessageTemplate
        .replace(/\{\{senderName\}\}/g, senderDisplayName)
        .replace(/\{\{channelName\}\}/g, groupChannel.name)
        .replace(/\{\{channelUrl\}\}/g, channelUrl);

      // Send message as sender to receiver in their user-chat
      await MessageService.createMessage({
        chatContextType: 'USER',
        contextId: userChat.id,
        senderId: senderId,
        content: inviteMessage,
        mediaUrls: [],
        chatType: ChatType.PUBLIC,
        mentionIds: []
      });
    } catch (error) {
      console.error('Failed to send invitation message to user-chat:', error);
      // Don't fail the invite creation if message sending fails
    }

    return invite;
  }

  static async acceptInvite(inviteId: string, userId: string) {
    const invite = await prisma.groupChannelInvite.findUnique({
      where: { id: inviteId },
      include: {
        groupChannel: true
      }
    });

    if (!invite) {
      throw new ApiError(404, 'Invitation not found');
    }

    if (invite.receiverId !== userId) {
      throw new ApiError(403, 'This invitation is not for you');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new ApiError(400, 'Invitation is no longer pending');
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ApiError(400, 'Invitation has expired');
    }

    // Update invite status
    await prisma.groupChannelInvite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.ACCEPTED }
    });

    // Add user as participant
    await prisma.groupChannelParticipant.create({
      data: {
        groupChannelId: invite.groupChannelId,
        userId,
        role: ParticipantRole.PARTICIPANT
      }
    });

    await prisma.groupChannel.update({
      where: { id: invite.groupChannelId },
      data: {
        participantsCount: {
          increment: 1
        }
      }
    });

    if (!invite.groupChannel.isChannel) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: USER_SELECT_FIELDS,
      });

      if (user) {
        const userName = getUserDisplayName(user.firstName, user.lastName);
        await createSystemMessage(
          invite.groupChannelId,
          {
            type: SystemMessageType.USER_JOINED_CHAT,
            variables: { userName }
          },
          undefined,
          ChatContextType.GROUP
        );
      }
    }

    return 'Successfully accepted invitation';
  }

  static async hideGroupChannel(groupChannelId: string, userId: string) {
    const participant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    if (!participant) {
      throw new ApiError(404, 'Not a participant');
    }

    await prisma.groupChannelParticipant.update({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      },
      data: {
        hidden: true
      }
    });

    return { success: true };
  }

  static async unhideGroupChannel(groupChannelId: string, userId: string) {
    const participant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    if (!participant) {
      throw new ApiError(404, 'Not a participant');
    }

    await prisma.groupChannelParticipant.update({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      },
      data: {
        hidden: false
      }
    });

    return { success: true };
  }

  static async isParticipant(groupChannelId: string, userId: string): Promise<boolean> {
    const participant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    return !!participant;
  }

  static async getParticipants(groupChannelId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const userParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    if (!userParticipant && !groupChannel.isPublic) {
      throw new ApiError(403, 'Only participants can view participants of private groups/channels');
    }

    const participants = await prisma.groupChannelParticipant.findMany({
      where: { groupChannelId },
      include: {
        user: {
          select: USER_SELECT_FIELDS
        }
      },
      orderBy: [
        { role: 'asc' },
        { joinedAt: 'asc' }
      ]
    });

    return participants;
  }

  static async getInvites(groupChannelId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const userParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    if (!userParticipant) {
      throw new ApiError(403, 'Only participants can view invites');
    }

    const invites = await prisma.groupChannelInvite.findMany({
      where: {
        groupChannelId,
        status: InviteStatus.PENDING
      },
      include: {
        sender: {
          select: USER_SELECT_FIELDS
        },
        receiver: {
          select: USER_SELECT_FIELDS
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return invites;
  }

  static async promoteToAdmin(groupChannelId: string, targetUserId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const isOwner = await this.isGroupChannelOwner(groupChannelId, userId);
    if (!isOwner) {
      throw new ApiError(403, 'Only owner can promote to admin');
    }

    const participant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: targetUserId
        }
      }
    });

    if (!participant) {
      throw new ApiError(404, 'Participant not found');
    }

    if (participant.role === ParticipantRole.OWNER) {
      throw new ApiError(400, 'Owner is already the highest role');
    }

    if (participant.role === ParticipantRole.ADMIN) {
      throw new ApiError(400, 'User is already an admin');
    }

    await prisma.groupChannelParticipant.update({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: targetUserId
        }
      },
      data: {
        role: ParticipantRole.ADMIN
      }
    });

    return { success: true };
  }

  static async removeAdmin(groupChannelId: string, targetUserId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const isOwner = await this.isGroupChannelOwner(groupChannelId, userId);
    if (!isOwner) {
      throw new ApiError(403, 'Only owner can remove admin');
    }

    const participant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: targetUserId
        }
      }
    });

    if (!participant || participant.role !== ParticipantRole.ADMIN) {
      throw new ApiError(404, 'Admin participant not found');
    }

    await prisma.groupChannelParticipant.update({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: targetUserId
        }
      },
      data: {
        role: ParticipantRole.PARTICIPANT
      }
    });

    return { success: true };
  }

  static async removeParticipant(groupChannelId: string, targetUserId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const targetParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: targetUserId
        }
      }
    });

    if (!targetParticipant) {
      throw new ApiError(404, 'Participant not found');
    }

    if (targetParticipant.role === ParticipantRole.OWNER) {
      throw new ApiError(400, 'Cannot remove owner. Transfer ownership first.');
    }

    const currentUserParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    const isOwner = currentUserParticipant?.role === ParticipantRole.OWNER;
    const isAdmin = currentUserParticipant?.role === ParticipantRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ApiError(403, 'Only owner or admin can remove participants');
    }

    if (isAdmin && targetParticipant.role === ParticipantRole.ADMIN) {
      throw new ApiError(403, 'Admins cannot remove other admins');
    }

    await prisma.groupChannelParticipant.delete({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: targetUserId
        }
      }
    });

    await prisma.groupChannel.update({
      where: { id: groupChannelId },
      data: {
        participantsCount: {
          decrement: 1
        }
      }
    });

    if (!groupChannel.isChannel) {
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: USER_SELECT_FIELDS,
      });

      if (user) {
        const userName = getUserDisplayName(user.firstName, user.lastName);
        await createSystemMessage(
          groupChannelId,
          {
            type: SystemMessageType.USER_LEFT_CHAT,
            variables: { userName }
          },
          undefined,
          ChatContextType.GROUP
        );
      }
    }

    return { success: true };
  }

  static async transferOwnership(groupChannelId: string, newOwnerId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { id: groupChannelId }
    });

    if (!groupChannel) {
      throw new ApiError(404, 'Group/Channel not found');
    }

    const isOwner = await this.isGroupChannelOwner(groupChannelId, userId);
    if (!isOwner) {
      throw new ApiError(403, 'Only owner can transfer ownership');
    }

    const currentOwnerParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId
        }
      }
    });

    if (!currentOwnerParticipant || currentOwnerParticipant.role !== ParticipantRole.OWNER) {
      throw new ApiError(403, 'User is not the owner');
    }

    const newOwnerParticipant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: {
          groupChannelId,
          userId: newOwnerId
        }
      }
    });

    if (!newOwnerParticipant) {
      throw new ApiError(404, 'User is not a participant');
    }

    if (newOwnerParticipant.role === ParticipantRole.OWNER) {
      throw new ApiError(400, 'User is already the owner');
    }

    await prisma.$transaction([
      prisma.groupChannelParticipant.update({
        where: {
          groupChannelId_userId: {
            groupChannelId,
            userId: newOwnerId
          }
        },
        data: {
          role: ParticipantRole.OWNER
        }
      }),
      prisma.groupChannelParticipant.update({
        where: {
          groupChannelId_userId: {
            groupChannelId,
            userId
          }
        },
        data: {
          role: ParticipantRole.ADMIN
        }
      })
    ]);

    const newOwnerUser = await prisma.user.findUnique({
      where: { id: newOwnerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (newOwnerUser) {
      const newOwnerName = getUserDisplayName(newOwnerUser.firstName, newOwnerUser.lastName);
      try {
        await createSystemMessage(
          groupChannelId,
          {
            type: SystemMessageType.OWNERSHIP_TRANSFERRED,
            variables: { newOwnerName }
          },
          undefined,
          ChatContextType.GROUP
        );
      } catch (error) {
        console.error('Failed to create system message for ownership transfer:', error);
      }
    }

    return { success: true };
  }

  static async cancelInvite(inviteId: string, userId: string) {
    const invite = await prisma.groupChannelInvite.findUnique({
      where: { id: inviteId },
      include: {
        groupChannel: true
      }
    });

    if (!invite) {
      throw new ApiError(404, 'Invitation not found');
    }

    const isOwner = await this.isGroupChannelOwner(invite.groupChannelId, userId);
    const isSender = invite.senderId === userId;

    if (!isOwner && !isSender) {
      throw new ApiError(403, 'Only sender or owner can cancel invitation');
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new ApiError(400, 'Can only cancel pending invitations');
    }

    await prisma.groupChannelInvite.delete({
      where: { id: inviteId }
    });

    return { success: true };
  }
}
