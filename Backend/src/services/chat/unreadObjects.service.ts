import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { ParticipantRole } from '@prisma/client';

export interface UnreadObjectsResult {
  games: Array<{
    game: any;
    unreadCount: number;
  }>;
  bugs: Array<{
    bug: any;
    unreadCount: number;
  }>;
  userChats: Array<{
    chat: any;
    unreadCount: number;
  }>;
  groupChannels: Array<{
    groupChannel: any;
    unreadCount: number;
  }>;
}

export class UnreadObjectsService {
  static async getUnreadObjects(userId: string): Promise<UnreadObjectsResult> {
    const result: UnreadObjectsResult = {
      games: [],
      bugs: [],
      userChats: [],
      groupChannels: [],
    };

    // 1. Get games with unread messages
    const userGames = await prisma.game.findMany({
      where: {
        OR: [
          {
            participants: {
              some: { userId }
            }
          },
          {
            invites: {
              some: {
                receiverId: userId,
                status: 'PENDING'
              }
            }
          }
        ]
      },
      include: {
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
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
        invites: {
          where: {
            receiverId: userId,
            status: 'PENDING'
          }
        }
      }
    });

    for (const game of userGames) {
      const participant = game.participants.find((p: any) => p.userId === userId);
      
      const chatTypeFilter: any[] = ['PUBLIC'];
      
      if (participant && participant.isPlaying) {
        chatTypeFilter.push('PRIVATE');
      }
      
      if (participant && (participant.role === 'OWNER' || participant.role === 'ADMIN')) {
        chatTypeFilter.push('ADMINS');
      }

      if (game.status !== 'ANNOUNCED') {
        chatTypeFilter.push('PHOTOS');
      }

      const gameUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'GAME',
          contextId: game.id,
          chatType: {
            in: chatTypeFilter
          },
          senderId: {
            not: userId
          },
          readReceipts: {
            none: {
              userId
            }
          }
        }
      });

      if (gameUnreadCount > 0) {
        result.games.push({
          game,
          unreadCount: gameUnreadCount
        });
      }
    }

    // 2. Get user chats with unread messages
    const userChats = await prisma.userChat.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId }
        ]
      },
      include: {
        user1: {
          select: USER_SELECT_FIELDS
        },
        user2: {
          select: USER_SELECT_FIELDS
        }
      }
    });

    for (const chat of userChats) {
      const userChatUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'USER',
          contextId: chat.id,
          senderId: { not: userId },
          readReceipts: {
            none: { userId }
          }
        }
      });

      if (userChatUnreadCount > 0) {
        result.userChats.push({
          chat,
          unreadCount: userChatUnreadCount
        });
      }
    }

    // 3. Get bugs with unread messages
    const userForBugs = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true }
    });

    if (userForBugs && userForBugs.isAdmin) {
      const allBugs = await prisma.bug.findMany({
        include: {
          sender: {
            select: {
              ...USER_SELECT_FIELDS,
              isAdmin: true,
            },
          },
          participants: {
            include: {
              user: {
                select: USER_SELECT_FIELDS,
              },
            },
          },
        },
      });

      for (const bug of allBugs) {
        const bugUnreadCount = await prisma.chatMessage.count({
          where: {
            chatContextType: 'BUG',
            contextId: bug.id,
            senderId: { not: userId },
            readReceipts: {
              none: { userId }
            }
          }
        });

        if (bugUnreadCount > 0) {
          result.bugs.push({
            bug,
            unreadCount: bugUnreadCount
          });
        }
      }
    } else {
      const userBugs = await prisma.bug.findMany({
        where: { senderId: userId },
        include: {
          sender: {
            select: {
              ...USER_SELECT_FIELDS,
              isAdmin: true,
            },
          },
          participants: {
            include: {
              user: {
                select: USER_SELECT_FIELDS,
              },
            },
          },
        },
      });

      const userBugParticipants = await prisma.bugParticipant.findMany({
        where: { userId },
        select: { bugId: true }
      });

      const participantBugIds = new Set(userBugParticipants.map(p => p.bugId));

      const participantBugs = await prisma.bug.findMany({
        where: {
          id: {
            in: Array.from(participantBugIds)
          }
        },
        include: {
          sender: {
            select: {
              ...USER_SELECT_FIELDS,
              isAdmin: true,
            },
          },
          participants: {
            include: {
              user: {
                select: USER_SELECT_FIELDS,
              },
            },
          },
        },
      });

      const allBugs = [...userBugs, ...participantBugs.filter(b => !userBugs.some(ub => ub.id === b.id))];

      for (const bug of allBugs) {
        const bugUnreadCount = await prisma.chatMessage.count({
          where: {
            chatContextType: 'BUG',
            contextId: bug.id,
            senderId: { not: userId },
            readReceipts: {
              none: { userId }
            }
          }
        });

        if (bugUnreadCount > 0) {
          result.bugs.push({
            bug,
            unreadCount: bugUnreadCount
          });
        }
      }
    }

    // 4. Get group channels with unread messages
    const userForGroups = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentCityId: true }
    });

    const userCityId = userForGroups?.currentCityId;

    const groupChannels = await prisma.groupChannel.findMany({
      where: {
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
            ...(userCityId ? { cityId: userCityId } : {}),
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
      },
      include: {
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

    for (const groupChannel of groupChannels) {
      const groupChannelUnreadCount = await prisma.chatMessage.count({
        where: {
          chatContextType: 'GROUP',
          contextId: groupChannel.id,
          senderId: { not: userId },
          readReceipts: {
            none: { userId }
          }
        }
      });

      if (groupChannelUnreadCount > 0) {
        const userParticipant = (groupChannel.participants as any[]).find((p: any) => p.userId === userId);
        const isOwner = userParticipant?.role === ParticipantRole.OWNER;
        const isParticipant = !!userParticipant;

        result.groupChannels.push({
          groupChannel: {
            ...groupChannel,
            isParticipant,
            isOwner
          },
          unreadCount: groupChannelUnreadCount
        });
      }
    }

    return result;
  }
}

