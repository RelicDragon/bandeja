import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { ChatMuteService } from '../chat/chatMute.service';
import { mapGroupChannelToResponse, type GcWithParticipants, type MappedGroupChannel } from '../chat/groupChannel.mapper';

export type CommonChatKind = 'group' | 'game' | 'bug' | 'channel' | 'market';

type CommonChatGame = Awaited<ReturnType<typeof fetchCommonGames>>[number] & {
  lastMessage: { preview: string; updatedAt: string } | null;
};

export interface CommonChatItem {
  id: string;
  kind: CommonChatKind;
  updatedAt: string;
  groupChannel?: MappedGroupChannel;
  game?: CommonChatGame;
}

function classifyGroupChannel(gc: {
  bugId?: string | null;
  marketItemId?: string | null;
  isChannel: boolean;
}): CommonChatKind {
  if (gc.bugId) return 'bug';
  if (gc.marketItemId) return 'market';
  if (gc.isChannel) return 'channel';
  return 'group';
}

async function fetchCommonGroupChannels(userId: string, otherUserId: string) {
  return prisma.groupChannel.findMany({
    where: {
      isCityGroup: false,
      AND: [
        { participants: { some: { userId, hidden: false } } },
        { participants: { some: { userId: otherUserId, hidden: false } } },
      ],
    },
    include: {
      bug: {
        include: {
          sender: { select: USER_SELECT_FIELDS },
        },
      },
      marketItem: {
        include: {
          seller: { select: USER_SELECT_FIELDS },
          category: true,
          city: true,
        },
      },
      buyer: { select: USER_SELECT_FIELDS },
      lastMessageSender: { select: USER_SELECT_FIELDS },
      participants: {
        where: { userId },
        include: {
          user: { select: USER_SELECT_FIELDS },
        },
      },
      pinnedByUsers: { where: { userId }, select: { pinnedAt: true } },
    },
  });
}

async function fetchCommonGames(userId: string, otherUserId: string) {
  return prisma.game.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
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
      court: {
        include: {
          club: {
            select: {
              name: true,
              city: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
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
      updatedAt: 'desc',
    },
  });
}

export class CommonChatsService {
  static async getCommonChats(userId: string, otherUserId: string): Promise<CommonChatItem[]> {
    if (userId === otherUserId) {
      return [];
    }

    const [groupChannels, games] = await Promise.all([
      fetchCommonGroupChannels(userId, otherUserId),
      fetchCommonGames(userId, otherUserId),
    ]);

    const items: CommonChatItem[] = [];

    if (groupChannels.length > 0) {
      const mutedIds = await ChatMuteService.getMutedContextIdSet(
        userId,
        ChatContextType.GROUP,
        groupChannels.map((g) => g.id)
      );

      for (const gc of groupChannels) {
        items.push({
          id: gc.id,
          kind: classifyGroupChannel(gc),
          updatedAt: gc.updatedAt.toISOString(),
          groupChannel: mapGroupChannelToResponse(gc as GcWithParticipants, userId, mutedIds.has(gc.id)),
        });
      }
    }

    for (const game of games) {
      items.push({
        id: game.id,
        kind: 'game',
        updatedAt: game.updatedAt.toISOString(),
        game: {
          ...game,
          lastMessage: game.lastMessagePreview
            ? { preview: game.lastMessagePreview, updatedAt: game.updatedAt.toISOString() }
            : null,
        },
      });
    }

    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return items;
  }
}
