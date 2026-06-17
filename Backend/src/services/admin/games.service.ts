import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS, USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { Sport } from '@prisma/client';
import { InviteService } from '../invite.service';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { undoGameOutcomes } from '../results/outcomes.service';
import { revertForGame } from '../levelChange';
import { calculateGameStatus } from '../../utils/gameStatus';
import { Prisma } from '@prisma/client';
import { projectUserForSportContext } from '../user/userSportProfile.service';
import { resolveLeagueSeasonSport } from '../../utils/validators/validateLeagueSeasonSport';

const GAMES_PAGE_SIZE = 50;

function resolveAdminGameSport(game: {
  entityType: string;
  sport?: Sport | null;
  parent?: { leagueSeason?: { sport?: Sport | null; game?: { sport?: Sport | null } | null } | null } | null;
  leagueSeason?: { sport?: Sport | null; game?: { sport?: Sport | null } | null } | null;
}): Sport {
  if (game.entityType === 'LEAGUE' && game.parent?.leagueSeason) {
    return resolveLeagueSeasonSport(game.parent.leagueSeason);
  }
  if (game.entityType === 'LEAGUE_SEASON' && game.leagueSeason) {
    return resolveLeagueSeasonSport(game.leagueSeason);
  }
  return game.sport ?? Sport.PADEL;
}

function projectAdminGameParticipants<
  G extends {
    entityType: string;
    sport?: Sport | null;
    parent?: { leagueSeason?: { sport?: Sport | null; game?: { sport?: Sport | null } | null } | null } | null;
    leagueSeason?: { sport?: Sport | null; game?: { sport?: Sport | null } | null } | null;
    participants?: Array<{ user?: Parameters<typeof projectUserForSportContext>[0] | null }>;
  },
>(game: G): G {
  const sport = resolveAdminGameSport(game);
  return {
    ...game,
    participants: (game.participants ?? []).map((p) => ({
      ...p,
      user: projectUserForSportContext(p.user, sport),
    })),
  };
}

export class AdminGamesService {
  static async getAllGames(params: {
    cityId?: string;
    search?: string;
    status?: string;
    entityType?: string;
    hasResults?: boolean;
    startDate?: string;
    endDate?: string;
    sport?: string;
    affectsRating?: boolean;
    scoringPreset?: string;
    gameType?: string;
    page?: number;
  }) {
    const {
      cityId,
      search,
      status,
      entityType,
      hasResults,
      startDate,
      endDate,
      sport,
      affectsRating,
      scoringPreset,
      gameType,
      page = 1,
    } = params;
    const skip = (page - 1) * GAMES_PAGE_SIZE;

    const where: Prisma.GameWhereInput = {};
    if (cityId) where.cityId = cityId;
    if (status) where.status = status as any;
    if (entityType) where.entityType = entityType as any;
    if (sport && Object.values(Sport).includes(sport as Sport)) {
      where.sport = sport as Sport;
    }
    if (affectsRating === true) where.affectsRating = true;
    if (affectsRating === false) where.affectsRating = false;
    if (scoringPreset) where.scoringPreset = scoringPreset as any;
    if (gameType) where.gameType = gameType as any;
    if (hasResults === true) where.resultsStatus = { not: 'NONE' };
    if (hasResults === false) where.resultsStatus = 'NONE';
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) (where.startTime as any).gte = new Date(startDate);
      if (endDate) (where.startTime as any).lte = new Date(endDate);
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { court: { club: { name: { contains: term, mode: 'insensitive' } } } },
        { court: { club: { city: { name: { contains: term, mode: 'insensitive' } } } } },
        {
          participants: {
            some: {
              role: 'OWNER',
              user: {
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                  { phone: { contains: term, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }

    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        include: {
          court: {
            include: {
              club: {
                include: {
                  city: true,
                },
              },
            },
          },
          club: { select: { id: true, name: true, avatar: true } },
          city: { select: { id: true, name: true } },
          participants: {
            include: {
              user: {
                select: {
                  ...USER_SELECT_FIELDS,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: { startTime: 'desc' },
        skip,
        take: GAMES_PAGE_SIZE,
      }),
      prisma.game.count({ where }),
    ]);

    return { games, total, page, pageSize: GAMES_PAGE_SIZE };
  }

  static async getGameById(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        court: {
          include: {
            club: {
              include: {
                city: true,
              },
            },
          },
        },
        club: { select: { id: true, name: true, avatar: true } },
        city: { select: { id: true, name: true } },
        trainer: { select: { ...USER_SELECT_FIELDS, phone: true } },
        participants: {
          include: {
            user: {
              select: {
                ...USER_SELECT_WITH_SPORT_PROFILES,
                phone: true,
              },
            },
          },
        },
        parent: {
          select: {
            id: true,
            entityType: true,
            leagueSeason: {
              select: {
                sport: true,
                game: { select: { sport: true } },
              },
            },
          },
        },
        leagueSeason: {
          select: {
            sport: true,
            game: { select: { sport: true } },
          },
        },
      },
    });
    if (!game) throw new ApiError(404, 'Game not found');
    return projectAdminGameParticipants(game);
  }

  static async getAllInvites(cityId?: string) {
    const participants = await prisma.gameParticipant.findMany({
      where: {
        status: 'INVITED',
        game: {
          status: { not: 'ARCHIVED' },
          ...(cityId && { cityId }),
        },
      },
      include: {
        invitedByUser: {
          select: { ...USER_SELECT_WITH_SPORT_PROFILES, phone: true },
        },
        user: {
          select: { ...USER_SELECT_WITH_SPORT_PROFILES, phone: true },
        },
        game: {
          select: {
            id: true,
            name: true,
            sport: true,
            gameType: true,
            scoringPreset: true,
            scoringMode: true,
            affectsRating: true,
            playersPerMatch: true,
            startTime: true,
            endTime: true,
            status: true,
            court: {
              include: {
                club: {
                  include: {
                    city: {
                      select: { id: true, name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return participants.map((p) => {
      const sport = p.game.sport;
      return {
      id: p.id,
      receiverId: p.userId,
      senderId: p.invitedByUserId,
      gameId: p.gameId,
      status: 'PENDING',
      message: p.inviteMessage,
      expiresAt: p.inviteExpiresAt,
      createdAt: p.joinedAt,
      receiver: p.user ? projectUserForSportContext(p.user, sport) : p.user,
      sender: p.invitedByUser ? projectUserForSportContext(p.invitedByUser, sport) : p.invitedByUser,
      game: p.game,
    };
    });
  }

  static async acceptInvite(participantId: string) {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      select: { userId: true, gameId: true },
    });
    if (!participant?.userId || !participant.gameId) {
      throw new ApiError(404, 'Invite not found');
    }
    const result = await InviteService.acceptInvite(participantId, participant.userId, true, true);
    if (!result.success) {
      const code =
        result.message === 'errors.invites.notFound'
          ? 404
          : result.message === 'errors.invites.notAuthorizedToAccept'
            ? 403
            : 400;
      throw new ApiError(code, result.message);
    }
    return { message: result.message, gameId: participant.gameId };
  }

  static async declineInvite(participantId: string) {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      select: { userId: true, gameId: true },
    });
    if (!participant?.userId) {
      throw new ApiError(404, 'Invite not found');
    }
    const result = await InviteService.declineInvite(participantId, participant.userId, true);
    if (!result.success) {
      const code =
        result.message === 'errors.invites.notFound'
          ? 404
          : result.message === 'errors.invites.notAuthorizedToDecline'
            ? 403
            : 400;
      throw new ApiError(code, result.message);
    }
    return { message: result.message };
  }

  static async resetGameResults(gameId: string, _adminUserId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: true,
        outcomes: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.status === 'ARCHIVED') {
      throw new ApiError(403, 'Cannot reset results for archived games');
    }

    await prisma.$transaction(async (tx) => {
      if (game.outcomes.length > 0) {
        await undoGameOutcomes(gameId, tx);
      } else {
        await revertForGame(gameId, 'all', tx);
      }

      await tx.roundOutcome.deleteMany({
        where: {
          round: {
            gameId,
          },
        },
      });

      await tx.set.deleteMany({
        where: {
          match: {
            round: {
              gameId,
            },
          },
        },
      });
      
      await tx.teamPlayer.deleteMany({
        where: {
          team: {
            match: {
              round: {
                gameId,
              },
            },
          },
        },
      });
      
      await tx.team.deleteMany({
        where: {
          match: {
            round: {
              gameId,
            },
          },
        },
      });
      
      await tx.match.deleteMany({
        where: {
          round: {
            gameId,
          },
        },
      });

      await tx.round.deleteMany({
        where: { gameId },
      });

      const updatedGame = await tx.game.findUnique({
        where: { id: gameId },
        select: { startTime: true, endTime: true, cityId: true, timeIsSet: true, entityType: true },
      });
      
      if (updatedGame) {
        const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
        await tx.game.update({
          where: { id: gameId },
          data: {
            resultsStatus: 'NONE',
            finishedDate: null,
            metadata: {
              ...((game.metadata as any) || {}),
            },
            status: calculateGameStatus({
              startTime: updatedGame.startTime,
              endTime: updatedGame.endTime,
              resultsStatus: 'NONE',
              timeIsSet: updatedGame.timeIsSet,
              entityType: updatedGame.entityType,
            }, cityTimezone),
          },
        });
      }
    });

    return { message: 'Game results reset successfully' };
  }
}
