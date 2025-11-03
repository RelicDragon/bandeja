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

  static async getGames(filters: any) {
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

    if (filters.cityId) {
      where.OR = [
        {
          court: {
            club: {
              cityId: filters.cityId,
            },
          },
        },
        {
          club: {
            cityId: filters.cityId,
          },
        },
      ];
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
          where: {
            OR: [
              { isPlaying: true },
              { role: { in: ['OWNER', 'ADMIN'] } },
            ],
          },
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
      },
      orderBy: { startTime: 'desc' },
      ...(limit && { take: limit }),
      ...(offset && { skip: offset }),
    });

    return games;
  }
}

