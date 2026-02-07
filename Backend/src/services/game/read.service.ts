import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';

const getLeagueSeasonInclude = () => ({
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
      avatar: true,
      originalAvatar: true,
    },
  },
});

export const getBaseGameInclude = () => ({
  city: {
    select: {
      id: true,
      name: true,
      country: true,
      telegramGroupId: true,
      timezone: true,
    },
  },
  club: {
    include: {
      courts: true,
      city: {
        select: {
          name: true,
        },
      },
    },
  },
  participants: {
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
      invitedByUser: {
        select: USER_SELECT_FIELDS,
      },
    },
  },
  fixedTeams: {
    include: {
      players: {
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
        },
      },
    },
    orderBy: { teamNumber: 'asc' as const },
  },
  leagueSeason: {
    include: getLeagueSeasonInclude(),
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
});

const getGamesCourtInclude = () => ({
  court: {
    include: {
      club: {
        select: {
          name: true,
          address: true,
          city: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
});

const getGameIncludeCourtInclude = () => ({
  court: {
    include: {
      club: true,
    },
  },
});

const getGamesParentInclude = () => ({
  parent: {
    include: {
      leagueSeason: {
        include: getLeagueSeasonInclude(),
      },
    },
  },
});

export const getGameInclude = () => ({
  ...getBaseGameInclude(),
  ...getGameIncludeCourtInclude(),
  outcomes: {
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
    orderBy: { position: 'asc' as const },
  },
  rounds: {
    include: {
      matches: {
        include: {
          teams: {
            include: {
              players: {
                include: {
                  user: {
                    select: USER_SELECT_FIELDS,
                  },
                },
              },
            },
          },
                sets: {
                  orderBy: { setNumber: 'asc' as const },
                },
        },
              orderBy: { matchNumber: 'asc' as const },
      },
    },
    orderBy: { roundNumber: 'asc' as const },
  },
  gameCourts: {
    include: {
      court: {
        include: {
          club: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
        },
      },
    },
    orderBy: { order: 'asc' as const },
  },
  parent: {
    include: {
      participants: {
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
        },
      },
      leagueSeason: {
        include: getLeagueSeasonInclude(),
      },
    },
  },
});

export function computeJoinQueuesFromParticipants(game: any): any[] {
  const inQueueParticipants = game.participants?.filter(
    (p: any) => p.status === 'IN_QUEUE' && p.role === 'PARTICIPANT'
  ) || [];
  return inQueueParticipants
    .map((p: any) => ({
      id: p.id,
      userId: p.userId,
      gameId: p.gameId,
      status: 'PENDING' as const,
      createdAt: p.joinedAt,
      updatedAt: p.joinedAt,
      user: p.user,
    }))
    .sort((a: any, b: any) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

export function participantsToInviteShape(participants: any[], game?: any): any[] {
  const invited = participants?.filter((p: any) => p.status === 'INVITED') || [];
  return invited.map((p: any) => ({
    id: p.id,
    receiverId: p.userId,
    gameId: p.gameId,
    status: 'PENDING',
    message: p.inviteMessage ?? null,
    expiresAt: p.inviteExpiresAt ?? null,
    createdAt: p.joinedAt,
    updatedAt: p.joinedAt,
    receiver: p.user,
    sender: p.invitedByUser ?? null,
    game: p.game ?? (game?.id === p.gameId ? game : null),
  }));
}

export class GameReadService {
  static async getGameById(id: string, userId?: string, skipRestrictions: boolean = false) {
    const game = await prisma.game.findUnique({
      where: { id },
      include: getGameInclude() as any,
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (userId && !skipRestrictions) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentCityId: true, isAdmin: true }
      });

      if (user && !user.isAdmin) {
        if (game.cityId === null) {
          throw new ApiError(403, 'Access denied: System games are not accessible');
        }
      }
    }

    let isClubFavorite = false;
    if (userId) {
      const gameWithRelations = game as any;
      const clubId = gameWithRelations.court?.club?.id || gameWithRelations.club?.id;
      if (clubId) {
        const favorite = await prisma.userFavoriteClub.findUnique({
          where: {
            userId_clubId: {
              userId,
              clubId,
            },
          },
        });
        isClubFavorite = !!favorite;
      }
    }

    return {
      ...game,
      isClubFavorite,
      joinQueues: computeJoinQueuesFromParticipants(game),
    };
  }

  static async getGames(filters: any, userId?: string, userCityId?: string) {
    const where: any = {};

    if (filters.startDate) {
      where.startTime = { gte: new Date(filters.startDate) };
    }

    if (filters.endDate) {
      where.endTime = { lte: new Date(filters.endDate) };
    }

    if (filters.startDateBefore) {
      where.startTime = { ...where.startTime, lt: new Date(filters.startDateBefore) };
    }

    if (filters.minLevel !== undefined) {
      where.minLevel = { gte: parseFloat(filters.minLevel) };
    }

    if (filters.maxLevel !== undefined) {
      where.maxLevel = { lte: parseFloat(filters.maxLevel) };
    }

    if (filters.gameType) {
      where.gameType = filters.gameType;
    }

    if (filters.isPublic !== undefined) {
      where.isPublic = filters.isPublic === 'true';
    }

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.participantUserId) {
      where.participants = {
        some: {
          userId: filters.participantUserId
        }
      };
    }

    const cityIdToFilter = filters.cityId || userCityId;
    if (cityIdToFilter) {
      where.cityId = cityIdToFilter;
    } else if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentCityId: true, isAdmin: true }
      });
      if (user && user.currentCityId && !user.isAdmin) {
        where.cityId = user.currentCityId;
      }
    }

    const limit = filters.limit ? parseInt(filters.limit) : undefined;
    const offset = filters.offset ? parseInt(filters.offset) : undefined;

    const games = await prisma.game.findMany({
      where,
      include: {
        ...getBaseGameInclude(),
        ...getGamesCourtInclude(),
        ...getGamesParentInclude(),
      },
      orderBy: { startTime: 'desc' },
      ...(limit && { take: limit }),
      ...(offset && { skip: offset }),
    });

    return games;
  }

  static async getMyGames(userId: string, _userCityId?: string) {
    if (!userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: any = {
      participants: {
        some: {
          userId: userId
        }
      },
      OR: [
        { status: { not: 'ARCHIVED' } },
        {
          status: 'ARCHIVED',
          startTime: { gte: today }
        }
      ]
    };

    const games = await prisma.game.findMany({
      where,
      include: getGameInclude() as any,
      orderBy: { startTime: 'desc' },
    });

    return games;
  }

  static async getPastGames(userId: string, userCityId?: string, limit: number = 30, offset: number = 0) {
    if (!userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: any = {
      participants: {
        some: {
          userId: userId
        }
      },
      status: 'ARCHIVED',
      startTime: { lt: today }
    };

    const games = await prisma.game.findMany({
      where,
      include: getGameInclude() as any,
      orderBy: { startTime: 'desc' },
      take: limit,
      skip: offset,
    });

    return games;
  }

  static async getAvailableGames(userId: string, userCityId?: string, startDate?: string, endDate?: string, showArchived?: boolean, includeLeagues?: boolean) {
    if (!userId) {
      throw new ApiError(401, 'Unauthorized');
    }

    const where: any = {
      OR: [
        { isPublic: true },
        {
          isPublic: false,
          participants: {
            some: { userId: userId }
          }
        },
        ...(includeLeagues ? [
          { entityType: 'LEAGUE' },
          { entityType: 'LEAGUE_SEASON' }
        ] : [])
      ]
    };

    if (!showArchived) {
      where.status = { not: 'ARCHIVED' };
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.startTime.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.startTime.lte = end;
      }
    }

    const cityIdToFilter = userCityId;
    if (cityIdToFilter) {
      where.cityId = cityIdToFilter;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentCityId: true, isAdmin: true }
      });
      if (user && user.currentCityId) {
        where.cityId = user.currentCityId;
      }
    }

    const games = await prisma.game.findMany({
      where,
      include: getGameInclude() as any,
      orderBy: { startTime: 'desc' },
    });

    return games;
  }
}

