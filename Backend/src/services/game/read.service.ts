import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { InviteStatus } from '@prisma/client';

const getGameInclude = () => ({
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
  court: {
    include: {
      club: true,
    },
  },
  participants: {
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
  },
  invites: {
    where: {
      status: InviteStatus.PENDING,
    },
    include: {
      receiver: {
        select: USER_SELECT_FIELDS,
      },
    },
  },
  joinQueues: {
    where: {
      status: InviteStatus.PENDING,
    },
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  outcomes: {
    include: {
      user: {
        select: USER_SELECT_FIELDS,
      },
    },
    orderBy: { position: 'asc' },
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
    orderBy: { teamNumber: 'asc' },
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
    orderBy: { order: 'asc' },
  },
  leagueSeason: {
    include: {
      league: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
});

export class GameReadService {
  static async getGameById(id: string, userId?: string) {
    const game = await prisma.game.findUnique({
      where: { id },
      include: getGameInclude() as any,
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentCityId: true, isAdmin: true }
      });

      if (user && !user.isAdmin) {
        if (game.cityId === null) {
          throw new ApiError(403, 'Access denied: System games are not accessible');
        }
        if (user.currentCityId && game.cityId !== user.currentCityId) {
          throw new ApiError(403, 'Access denied: Game is not in your city');
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
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: true,
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
          },
        },
      },
      orderBy: { startTime: 'desc' },
      ...(limit && { take: limit }),
      ...(offset && { skip: offset }),
    });

    return games;
  }
}

