import prisma from '../../config/database';
import { Sport } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { getUserGameNote, getUserNotesForGames } from '../userGameNote.service';
import { InviteService } from '../invite.service';
import { ReadReceiptService } from '../chat/readReceipt.service';
import { attachReactionsToGames, fetchReactionsByGameIds } from './gameReaction.service';
import { buildResultsArtifactsDto } from '../gameResultsArtifact/gameResultsArtifact.dto';
import { getOwnerIsPremiumFromGame } from '../gameResultsArtifact/gameResultsArtifact.ownerPremium';
import { getMaxArtifactPhotoGenerations } from '../gameResultsArtifact/gameResultsArtifact.photoLimit';
import {
  projectUserForSportContext,
  resolvePublicGamesSportFilter,
} from '../user/userSportProfile.service';
import {
  gameBaseInclude,
  gameWithRoundsAndOutcomes,
  MAIN_PHOTO_RELATION_SELECT,
} from './gamePrismaIncludes';
import { serializeLinkedBooking } from './gameExternalBooking.service';
import { withLegacyGoldenPointField } from '../../shared/gameFormat/goldenPoint';
import {
  canViewGamePhotos,
  type GamePhotosViewer,
} from '../../shared/gamePhotos/permissions';
import { WeatherForecastService } from '../weatherForecast.service';

export { MAIN_PHOTO_RELATION_SELECT };

function buildPhotoViewer(userId?: string, isAdmin?: boolean): GamePhotosViewer | undefined {
  if (!userId) return undefined;
  return { id: userId, isAdmin: isAdmin ?? false };
}

export function projectGamePhotoPayload(game: any, viewer?: GamePhotosViewer | null): any {
  const mainPhoto = game.mainPhoto;
  const canViewPhotos = canViewGamePhotos(game, viewer);
  const {
    mainPhotoId: _mainPhotoId,
    photos: _photos,
    resultsArtifactJob: _resultsArtifactJob,
    externalBookings: _externalBookings,
    ...rest
  } = game;
  void _mainPhotoId;
  void _photos;
  void _resultsArtifactJob;
  void _externalBookings;
  return withLegacyGoldenPointField({
    ...rest,
    timeOverride: game.timeOverride ?? false,
    linkedBookings: (game.externalBookings ?? []).map(serializeLinkedBooking),
    photosCount: canViewPhotos ? (game.photosCount ?? 0) : 0,
    mainPhoto:
      canViewPhotos && mainPhoto
      ? {
          id: mainPhoto.id,
          thumbnailUrl: mainPhoto.thumbnailUrl,
          originalUrl: mainPhoto.originalUrl,
        }
      : null,
    resultsArtifacts: buildResultsArtifactsDto(
      {
        resultsArtifactsVersion: game.resultsArtifactsVersion ?? 0,
        resultsArtifactsReadyAt: game.resultsArtifactsReadyAt ?? null,
        resultsArtifactJob: game.resultsArtifactJob ?? null,
      },
      getMaxArtifactPhotoGenerations(getOwnerIsPremiumFromGame(game))
    ),
  });
}

export function projectGameUsersForSportContext<T extends { sport?: Sport; [key: string]: any }>(game: T): T {
  const sport = game.sport ?? Sport.PADEL;
  return {
    ...game,
    participants: (game.participants ?? []).map((p: any) => ({
      ...p,
      user: projectUserForSportContext(p.user, sport),
      invitedByUser: projectUserForSportContext(p.invitedByUser, sport),
    })),
    outcomes: (game.outcomes ?? []).map((o: any) => ({
      ...o,
      user: projectUserForSportContext(o.user, sport),
    })),
    fixedTeams: (game.fixedTeams ?? []).map((team: any) => ({
      ...team,
      players: (team.players ?? []).map((player: any) => ({
        ...player,
        user: projectUserForSportContext(player.user, sport),
      })),
    })),
    rounds: (game.rounds ?? []).map((round: any) => ({
      ...round,
      matches: (round.matches ?? []).map((match: any) => ({
        ...match,
        teams: (match.teams ?? []).map((team: any) => ({
          ...team,
          players: (team.players ?? []).map((player: any) => ({
            ...player,
            user: projectUserForSportContext(player.user, sport),
          })),
        })),
      })),
      outcomes: (round.outcomes ?? []).map((o: any) => ({
        ...o,
        user: projectUserForSportContext(o.user, sport),
      })),
    })),
  };
}

export function projectRoundUsersForSportContext<
  T extends { matches?: any[]; outcomes?: any[] },
>(round: T, sport: Sport): T {
  return {
    ...round,
    matches: (round.matches ?? []).map((match: any) => ({
      ...match,
      teams: (match.teams ?? []).map((team: any) => ({
        ...team,
        players: (team.players ?? []).map((player: any) => ({
          ...player,
          user: projectUserForSportContext(player.user, sport),
        })),
      })),
    })),
    outcomes: (round.outcomes ?? []).map((o: any) => ({
      ...o,
      user: projectUserForSportContext(o.user, sport),
    })),
  };
}

export function projectMatchUsersForSportContext<T extends { teams?: any[] }>(
  match: T,
  sport: Sport,
): T {
  return {
    ...match,
    teams: (match.teams ?? []).map((team: any) => ({
      ...team,
      players: (team.players ?? []).map((player: any) => ({
        ...player,
        user: projectUserForSportContext(player.user, sport),
      })),
    })),
  };
}

export function projectUserTeamForSportContext<
  T extends { owner?: any; members?: Array<{ user?: any; [key: string]: unknown }> },
>(team: T, sport: Sport): T {
  return {
    ...team,
    owner: team.owner ? projectUserForSportContext(team.owner, sport) : team.owner,
    members: (team.members ?? []).map((m) => ({
      ...m,
      user: m.user ? projectUserForSportContext(m.user, sport) : m.user,
    })),
  };
}

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
      sport: true,
    },
  },
});

const getBaseGameInclude = () => gameBaseInclude;

const getGamesCourtInclude = () => ({
  court: {
    include: {
      club: {
        select: {
          id: true,
          name: true,
          avatar: true,
          address: true,
          integrationType: true,
          integrationConfig: true,
          city: {
            select: {
              name: true,
              timezone: true,
            },
          },
        },
      },
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

const getAvailableGamesInclude = () => ({
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
    select: {
      id: true,
      name: true,
      avatar: true,
      address: true,
      cityId: true,
      integrationType: true,
      integrationConfig: true,
      city: {
        select: {
          timezone: true,
        },
      },
    },
  },
  court: {
    include: {
      club: {
        select: {
          id: true,
          name: true,
          avatar: true,
          address: true,
          integrationType: true,
          integrationConfig: true,
          city: {
            select: {
              name: true,
              timezone: true,
            },
          },
        },
      },
    },
  },
  participants: {
    include: {
      user: {
        select: USER_SELECT_WITH_SPORT_PROFILES,
      },
    },
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
      roundType: true,
      playoffFormat: true,
      bracketScope: true,
    },
  },
  parent: {
    include: {
      leagueSeason: {
        include: getLeagueSeasonInclude(),
      },
    },
  },
  mainPhoto: MAIN_PHOTO_RELATION_SELECT,
  resultsArtifactJob: {
    select: {
      status: true,
      summaryStatus: true,
      photoStatus: true,
      photoGenerationsUsed: true,
    },
  },
});

export function computeJoinQueuesFromParticipants(game: any): any[] {
  const inQueueParticipants = game.participants?.filter(
    (p: any) => p.status === 'IN_QUEUE'
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
      include: gameWithRoundsAndOutcomes,
    });

    if (!game) {
      const cancelled = await prisma.cancelledGame.findUnique({
        where: { id },
        select: {
          entityType: true,
          name: true,
          sport: true,
          cancelledAt: true,
          cancelledByUserId: true,
          parentId: true,
          participants: {
            include: {
              user: { select: USER_SELECT_WITH_SPORT_PROFILES },
            },
          },
        },
      });
      if (cancelled) {
        const cancelledSport = cancelled.sport ?? Sport.PADEL;
        const cancelledByUserRaw = await prisma.user.findUnique({
          where: { id: cancelled.cancelledByUserId },
          select: USER_SELECT_WITH_SPORT_PROFILES,
        });
        const cancelledByUser = cancelledByUserRaw
          ? projectUserForSportContext(cancelledByUserRaw, cancelledSport)
          : undefined;
        const participants = cancelled.participants.map((p) => ({
          userId: p.userId,
          role: p.role,
          status: p.status,
          user: projectUserForSportContext(p.user, cancelledSport),
        }));
        throw new ApiError(410, 'Game cancelled by owner', true, {
          cancelled: true,
          entityType: cancelled.entityType,
          name: cancelled.name,
          sport: cancelledSport,
          cancelledAt: cancelled.cancelledAt.toISOString(),
          cancelledByUser,
          chatArchived: true,
          parentId: cancelled.parentId,
          participants,
        });
      }
      throw new ApiError(404, 'Game not found');
    }

    let viewerIsAdmin = false;
    if (userId && !skipRestrictions) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentCityId: true, isAdmin: true }
      });

      viewerIsAdmin = user?.isAdmin ?? false;

      if (user && !user.isAdmin) {
        if (game.cityId === null) {
          throw new ApiError(403, 'Access denied: System games are not accessible');
        }
      }
    } else if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      });
      viewerIsAdmin = user?.isAdmin ?? false;
    }

    let isClubFavorite = false;
    let userNote: string | null = null;
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

      const note = await getUserGameNote(userId, id);
      userNote = note?.content || null;
    }

    const photoViewer = buildPhotoViewer(userId, viewerIsAdmin);
    const gameWithSportLevels = projectGamePhotoPayload(
      projectGameUsersForSportContext(game),
      photoViewer,
    );
    const base = {
      ...gameWithSportLevels,
      isClubFavorite,
      userNote,
      joinQueues: computeJoinQueuesFromParticipants(gameWithSportLevels),
    };
    const [baseWithWeather] = await WeatherForecastService.attachSummariesToGames([base]);
    const reactionsMap = await fetchReactionsByGameIds([id]);
    return attachReactionsToGames([baseWithWeather], reactionsMap)[0];
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

    let listViewerIsAdmin = false;
    const cityIdToFilter = filters.cityId || userCityId;
    if (cityIdToFilter) {
      where.cityId = cityIdToFilter;
    } else if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentCityId: true, isAdmin: true }
      });
      listViewerIsAdmin = user?.isAdmin ?? false;
      if (user && user.currentCityId && !user.isAdmin) {
        where.cityId = user.currentCityId;
      }
    }

    const limit = filters.limit ? parseInt(filters.limit) : undefined;
    const offset = filters.offset ? parseInt(filters.offset) : undefined;

    const gamesRaw = await prisma.game.findMany({
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

    const photoViewer = buildPhotoViewer(userId, listViewerIsAdmin);
    const games = gamesRaw.map((g) =>
      projectGamePhotoPayload(projectGameUsersForSportContext(g), photoViewer)
    );

    // Batch fetch user notes
    if (userId && games.length > 0) {
      const gameIds = games.map(g => g.id);
      const notesMap = await getUserNotesForGames(userId, gameIds);
      const withNotes = games.map(game => ({
        ...game,
        userNote: notesMap.get(game.id) || null,
      }));
      const withWeather = await WeatherForecastService.attachSummariesToGames(withNotes);
      const reactionsMap = await fetchReactionsByGameIds(gameIds);
      return attachReactionsToGames(withWeather, reactionsMap);
    }

    const withWeather = await WeatherForecastService.attachSummariesToGames(games);
    const reactionsMap = await fetchReactionsByGameIds(games.map((g) => g.id));
    return attachReactionsToGames(withWeather, reactionsMap);
  }

  static async getMyGames(userId: string, _userCityId?: string) {
    if (!userId) {
      throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
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

    const myUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    const photoViewer = buildPhotoViewer(userId, myUser?.isAdmin ?? false);

    const gamesRaw = await prisma.game.findMany({
      where,
      include: gameWithRoundsAndOutcomes,
      orderBy: { startTime: 'desc' },
    });
    const games = gamesRaw.map((g) =>
      projectGamePhotoPayload(projectGameUsersForSportContext(g), photoViewer)
    );

    // Batch fetch user notes
    if (games.length > 0) {
      const gameIds = games.map(g => g.id);
      const notesMap = await getUserNotesForGames(userId, gameIds);
      const withNotes = games.map(game => ({
        ...game,
        userNote: notesMap.get(game.id) || null,
      }));
      const withWeather = await WeatherForecastService.attachSummariesToGames(withNotes);
      const reactionsMap = await fetchReactionsByGameIds(gameIds);
      return attachReactionsToGames(withWeather, reactionsMap);
    }

    return WeatherForecastService.attachSummariesToGames(games);
  }

  static async getMyGamesWithUnread(userId: string, userCityId?: string) {
    const [games, invites] = await Promise.all([
      GameReadService.getMyGames(userId, userCityId),
      InviteService.getMyPendingInvites(userId),
    ]);
    const gamesUnreadCounts =
      games.length > 0
        ? await ReadReceiptService.getGamesUnreadCountsFromGames(
            games.map((g) => ({ id: g.id, status: g.status, participants: (g as any).participants ?? [] })),
            userId
          )
        : {};
    return { games, invites, gamesUnreadCounts };
  }

  static async getPastGames(
    userId: string,
    userCityId?: string,
    limit: number = 30,
    offset: number = 0,
    startDate?: string,
    endDate?: string
  ) {
    if (!userId) {
      throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startTimeFilter: { lt: Date } | { gte: Date; lte: Date };
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const rangeEnd = end.getTime() < today.getTime() ? end : today;
      startTimeFilter = { gte: start, lte: rangeEnd };
    } else {
      startTimeFilter = { lt: today };
    }

    const where: any = {
      participants: {
        some: {
          userId: userId
        }
      },
      status: 'ARCHIVED',
      startTime: startTimeFilter,
      OR: [
        { entityType: { not: 'LEAGUE_SEASON' } },
        { entityType: 'LEAGUE_SEASON', resultsStatus: 'FINAL' },
      ],
    };

    const pastUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    const photoViewer = buildPhotoViewer(userId, pastUser?.isAdmin ?? false);

    const gamesRaw = await prisma.game.findMany({
      where,
      include: gameWithRoundsAndOutcomes,
      orderBy: { startTime: 'desc' },
      take: limit,
      skip: offset,
    });
    const games = gamesRaw.map((g) =>
      projectGamePhotoPayload(projectGameUsersForSportContext(g), photoViewer)
    );

    if (games.length > 0) {
      const gameIds = games.map(g => g.id);
      const notesMap = await getUserNotesForGames(userId, gameIds);
      const withNotes = games.map(game => ({
        ...game,
        userNote: notesMap.get(game.id) || null,
      }));
      const withWeather = await WeatherForecastService.attachSummariesToGames(withNotes);
      const reactionsMap = await fetchReactionsByGameIds(gameIds);
      return attachReactionsToGames(withWeather, reactionsMap);
    }

    return WeatherForecastService.attachSummariesToGames(games);
  }

  static async getAvailableGames(
    userId: string,
    userCityId?: string,
    startDate?: string,
    endDate?: string,
    showArchived?: boolean,
    includeLeagues?: boolean,
    sportQuery?: unknown,
    primarySport?: Sport | string | null,
    showPrivateGames?: boolean,
    isAdmin?: boolean,
  ) {
    if (!userId) {
      throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
    }

    let viewerPrimarySport = primarySport;
    if (viewerPrimarySport === undefined) {
      const viewer = await prisma.user.findUnique({
        where: { id: userId },
        select: { primarySport: true },
      });
      viewerPrimarySport = viewer?.primarySport;
    }
    const sportFilter = resolvePublicGamesSportFilter(sportQuery, viewerPrimarySport);

    const includeAllPrivate = Boolean(showPrivateGames && isAdmin);
    const visibilityOr: any[] = [{ isPublic: true }];
    if (includeAllPrivate) {
      visibilityOr.push({ isPublic: false });
    } else {
      visibilityOr.push({
        isPublic: false,
        participants: {
          some: { userId: userId },
        },
      });
    }
    if (includeLeagues) {
      visibilityOr.push({ entityType: 'LEAGUE' }, { entityType: 'LEAGUE_SEASON' });
    }

    const where: any = {
      OR: visibilityOr,
    };

    if (!showArchived) {
      where.status = { not: 'ARCHIVED' };
    }

    if (startDate || endDate) {
      const startTimeRange: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        startTimeRange.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        startTimeRange.lte = end;
      }
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [{ entityType: 'LEAGUE_SEASON' }, { startTime: startTimeRange }],
        },
      ];
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

    if (sportFilter.mode === 'single') {
      where.sport = sportFilter.sport;
    }

    const photoViewer = buildPhotoViewer(userId, isAdmin ?? false);

    const gamesRaw = await prisma.game.findMany({
      where,
      include: getAvailableGamesInclude() as any,
      orderBy: { startTime: 'desc' },
    });
    const games = gamesRaw.map((g) =>
      projectGamePhotoPayload(projectGameUsersForSportContext(g), photoViewer)
    );

    if (games.length > 0) {
      const gameIds = games.map(g => g.id);
      const notesMap = await getUserNotesForGames(userId, gameIds);
      const withNotes = games.map(game => ({
        ...game,
        userNote: notesMap.get(game.id) || null,
      }));
      const withWeather = await WeatherForecastService.attachSummariesToGames(withNotes);
      const reactionsMap = await fetchReactionsByGameIds(gameIds);
      return attachReactionsToGames(withWeather, reactionsMap);
    }

    return WeatherForecastService.attachSummariesToGames(games);
  }

  static async getAvailableUpcomingGames(
    userId: string,
    userCityId?: string,
    includeLeagues?: boolean,
    sportQuery?: unknown,
    primarySport?: Sport | string | null,
    showPrivateGames?: boolean,
    isAdmin?: boolean,
  ) {
    if (!userId) {
      throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
    }

    let viewerPrimarySport = primarySport;
    if (viewerPrimarySport === undefined) {
      const viewer = await prisma.user.findUnique({
        where: { id: userId },
        select: { primarySport: true },
      });
      viewerPrimarySport = viewer?.primarySport;
    }
    const sportFilter = resolvePublicGamesSportFilter(sportQuery, viewerPrimarySport);

    const includeAllPrivate = Boolean(showPrivateGames && isAdmin);
    const visibilityOr: any[] = [{ isPublic: true }];
    if (includeAllPrivate) {
      visibilityOr.push({ isPublic: false });
    } else {
      visibilityOr.push({
        isPublic: false,
        participants: {
          some: { userId },
        },
      });
    }
    if (includeLeagues) {
      visibilityOr.push({ entityType: 'LEAGUE' }, { entityType: 'LEAGUE_SEASON' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setFullYear(horizon.getFullYear() + 1);
    horizon.setHours(23, 59, 59, 999);

    const where: any = {
      OR: visibilityOr,
      status: { not: 'ARCHIVED' },
      AND: [
        {
          OR: [
            { entityType: 'LEAGUE_SEASON' },
            { startTime: { gte: today, lte: horizon } },
          ],
        },
      ],
    };

    const cityIdToFilter = userCityId;
    if (cityIdToFilter) {
      where.cityId = cityIdToFilter;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentCityId: true, isAdmin: true },
      });
      if (user?.currentCityId) {
        where.cityId = user.currentCityId;
      }
    }

    if (sportFilter.mode === 'single') {
      where.sport = sportFilter.sport;
    }

    const photoViewer = buildPhotoViewer(userId, isAdmin ?? false);

    const gamesRaw = await prisma.game.findMany({
      where,
      include: getAvailableGamesInclude() as any,
      orderBy: { startTime: 'asc' },
      take: 300,
    });
    const games = gamesRaw.map((g) =>
      projectGamePhotoPayload(projectGameUsersForSportContext(g), photoViewer),
    );

    if (games.length === 0) {
      return games;
    }

    const gameIds = games.map((g) => g.id);
    const notesMap = await getUserNotesForGames(userId, gameIds);
    const withNotes = games.map((game) => ({
      ...game,
      userNote: notesMap.get(game.id) || null,
    }));
    const withWeather = await WeatherForecastService.attachSummariesToGames(withNotes);
    const reactionsMap = await fetchReactionsByGameIds(gameIds);
    return attachReactionsToGames(withWeather, reactionsMap);
  }
}
