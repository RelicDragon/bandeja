import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import {
  USER_SELECT_FIELDS,
  USER_SPORT_PROFILE_SELECT,
  USER_STATS_TARGET_SELECT,
} from '../../utils/constants';
import { getUserGameOutcomeAggregates } from '../../services/user/userGameOutcomeStats.service';
import { getUserPerformanceInsights } from '../../services/user/userPerformanceInsights.service';
import {
  addScoredComparisonMatchStats,
  emptyComparisonRelationshipStats,
} from '../../services/user/playerComparisonStats.service';
import {
  parseSportParam,
  projectUserForSportContext,
  resolveUserSportSnapshot,
} from '../../services/user/userSportProfile.service';
import { accrueRatingUncertainty, isRatingSettling } from '../../services/results/ratingUncertainty';
import { EntityType, ParticipantRole, Sport } from '@prisma/client';
import { resolveSport } from '../../sport/sportRegistry';
import type { Prisma } from '@prisma/client';

const COMPARISON_USER_SELECT = {
  ...USER_SELECT_FIELDS,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

type ComparisonUser = Prisma.UserGetPayload<{ select: typeof COMPARISON_USER_SELECT }>;

type ParticipantWithUser = {
  id: string;
  userId: string;
  role: ParticipantRole;
  status?: string;
  isPlaying?: boolean;
  joinedAt: Date;
  stats: any;
  user: ComparisonUser;
};

function resolveStatsSport(sportQuery: unknown, primarySport: Sport | string | null | undefined): Sport {
  if (typeof sportQuery === 'string' && sportQuery.trim().length > 0) {
    return parseSportParam(sportQuery);
  }
  return resolveSport(primarySport ?? Sport.PADEL);
}

function serializeComparisonGame(
  game: {
    id: string;
    name: string | null;
    sport: Sport;
    gameType: string;
    startTime: Date;
    endTime: Date;
    status: string;
    resultsStatus: string;
    entityType: string;
    maxParticipants: number;
    minParticipants: number;
    isPublic: boolean;
    affectsRating: boolean;
    allowDirectJoin: boolean;
    hasFixedTeams: boolean;
    genderTeams: string;
    photosCount: number | null;
    participants: ParticipantWithUser[];
    club: {
      id: string;
      name: string;
      city: { id: string; name: string } | null;
    } | null;
    court: {
      id: string;
      name: string;
      club: {
        id: string;
        name: string;
        city: { id: string; name: string } | null;
      } | null;
    } | null;
    createdAt: Date;
    updatedAt: Date;
  },
  currentUserId: string,
  otherUserId: string,
) {
  const sport = game.sport ?? Sport.PADEL;
  const currentUserParticipant = game.participants.find(
    (p: ParticipantWithUser) => p.userId === currentUserId && p.status === 'PLAYING'
  );
  const otherUserParticipant = game.participants.find(
    (p: ParticipantWithUser) => p.userId === otherUserId && p.status === 'PLAYING'
  );
  if (!currentUserParticipant || !otherUserParticipant) return null;

  return {
    id: game.id,
    name: game.name,
    sport,
    gameType: game.gameType,
    startTime: game.startTime,
    endTime: game.endTime,
    status: game.status,
    resultsStatus: game.resultsStatus,
    entityType: game.entityType,
    maxParticipants: game.maxParticipants,
    minParticipants: game.minParticipants,
    isPublic: game.isPublic,
    affectsRating: game.affectsRating,
    allowDirectJoin: game.allowDirectJoin,
    hasFixedTeams: game.hasFixedTeams,
    genderTeams: game.genderTeams,
    photosCount: game.photosCount || 0,
    participants: game.participants.map((p: ParticipantWithUser) => ({
      id: p.id,
      userId: p.userId,
      role: p.role,
      isPlaying: p.status === 'PLAYING',
      joinedAt: p.joinedAt,
      stats: p.stats,
      user: projectUserForSportContext(p.user, sport),
    })),
    club: game.club
      ? {
          id: game.club.id,
          name: game.club.name,
          city: game.club.city
            ? {
                id: game.club.city.id,
                name: game.club.city.name,
              }
            : null,
        }
      : null,
    court: game.court
      ? {
          id: game.court.id,
          name: game.court.name,
          club: game.court.club
            ? {
                id: game.court.club.id,
                name: game.court.club.name,
                city: game.court.club.city
                  ? {
                      id: game.court.club.city.id,
                      name: game.court.club.city.name,
                    }
                  : null,
              }
            : null,
        }
      : null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

export const getUserStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const explicitSport =
    typeof req.query.sport === 'string' && req.query.sport.trim().length > 0;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_STATS_TARGET_SELECT,
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const sport = resolveStatsSport(req.query.sport, user.primarySport);

  let approvedByUser = null;
  if (req.userId && user.approvedById) {
    approvedByUser = await prisma.user.findUnique({
      where: { id: user.approvedById },
      select: {
        ...USER_SELECT_FIELDS,
        sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
      },
    });
    if (approvedByUser) {
      approvedByUser = projectUserForSportContext(approvedByUser, sport);
    }
  }

  const levelHistory = await prisma.gameOutcome.findMany({
    where: { userId, game: { sport } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      gameId: true,
      levelBefore: true,
      levelAfter: true,
      levelChange: true,
      createdAt: true,
    },
  });

  const [{ gamesLast30Days, gamesStats }, allSportsAggregates, performanceInsights] = await Promise.all([
    getUserGameOutcomeAggregates(userId, sport),
    explicitSport ? null : getUserGameOutcomeAggregates(userId),
    getUserPerformanceInsights(userId, sport),
  ]);

  const isFavorite = req.userId ? await prisma.userFavoriteUser.findUnique({
    where: {
      userId_favoriteUserId: {
        userId: req.userId,
        favoriteUserId: userId,
      },
    },
  }) : null;

  const followersCount = await prisma.userFavoriteUser.count({
    where: {
      favoriteUserId: userId,
    },
  });

  const followingCount = await prisma.userFavoriteUser.count({
    where: {
      userId: userId,
    },
  });

  const projectedUser = {
    ...projectUserForSportContext(user, sport),
    isFavorite: !!isFavorite,
    approvedBy: approvedByUser,
  };

  const snap = resolveUserSportSnapshot(user, sport);
  const effectiveUncertainty = accrueRatingUncertainty(
    snap.ratingUncertainty,
    snap.lastRatingActivityAt,
  );
  (projectedUser as { ratingSettling?: boolean }).ratingSettling = isRatingSettling(
    snap.lastRatingActivityAt,
  );

  if (req.userId) {
    const viewer = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isAdmin: true },
    });
    if (viewer?.isAdmin) {
      (projectedUser as { ratingUncertainty?: number }).ratingUncertainty = effectiveUncertainty;
    }
  }
  if (!req.userId) {
    delete (projectedUser as { telegramId?: unknown }).telegramId;
    delete (projectedUser as { telegramUsername?: unknown }).telegramUsername;
  }

  res.json({
    success: true,
    data: {
      sport,
      user: projectedUser,
      levelHistory: levelHistory.reverse(),
      gamesLast30Days,
      followersCount,
      followingCount,
      gamesStats,
      performanceInsights,
      ...(allSportsAggregates
        ? {
            gamesStatsAllSports: allSportsAggregates.gamesStats,
            gamesLast30DaysAllSports: allSportsAggregates.gamesLast30Days,
          }
        : {}),
    },
  });
});

export const getPlayerComparison = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { otherUserId } = req.params as { otherUserId: string };
  const currentUserId = req.userId!;

  if (!otherUserId) {
    throw new ApiError(400, 'Other user ID is required');
  }

  if (otherUserId === currentUserId) {
    throw new ApiError(400, 'Cannot compare with yourself');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { primarySport: true },
  });
  if (!currentUser) {
    throw new ApiError(401, 'User not found');
  }
  const sport = resolveStatsSport(req.query.sport, currentUser.primarySport);

  const otherUserRow = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: COMPARISON_USER_SELECT,
  });

  if (!otherUserRow) {
    throw new ApiError(404, 'Other user not found');
  }
  const otherUser = projectUserForSportContext(otherUserRow, sport);

  const gamesTogether = await prisma.gameParticipant.findMany({
    where: {
      userId: currentUserId,
      status: 'PLAYING',
      game: {
        sport,
        resultsStatus: 'FINAL',
        entityType: { notIn: [EntityType.BAR, EntityType.LEAGUE_SEASON] },
        participants: {
          some: {
            userId: otherUserId,
            status: 'PLAYING',
          },
        },
      },
    },
    include: {
      game: {
        include: {
          participants: {
            include: {
              user: {
                select: COMPARISON_USER_SELECT,
              },
            },
          },
          club: {
            include: {
              city: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          court: {
            include: {
              club: {
                include: {
                  city: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          fixedTeams: {
            include: {
              players: {
                select: {
                  userId: true,
                },
              },
            },
          },
          rounds: {
            include: {
              matches: {
                include: {
                  teams: {
                    include: {
                      players: {
                        select: {
                          userId: true,
                        },
                      },
                    },
                  },
                  sets: { orderBy: { setNumber: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });

  const comparisonBuckets = {
    together: emptyComparisonRelationshipStats(),
    against: emptyComparisonRelationshipStats(),
  };

  const addStatsFromMatchTeamsOnly = (game: (typeof gamesTogether)[0]['game']): boolean => {
    let playedAgainst = false;
    for (const round of game.rounds) {
      for (const match of round.matches) {
        const relationship = addScoredComparisonMatchStats(
          comparisonBuckets,
          currentUserId,
          otherUserId,
          match,
        );
        if (relationship === 'against') playedAgainst = true;
      }
    }
    return playedAgainst;
  };

  for (const participant of gamesTogether) {
    const game = participant.game;
    const hasFixedTeams = game.hasFixedTeams;

    if (hasFixedTeams && game.fixedTeams.length > 0) {
      const currentUserTeam = game.fixedTeams.find((team) =>
        team.players.some((p) => p.userId === currentUserId)
      );
      const otherUserTeam = game.fixedTeams.find((team) =>
        team.players.some((p) => p.userId === otherUserId)
      );

      if (currentUserTeam && otherUserTeam) {
        const sameFixedTeam = currentUserTeam.id === otherUserTeam.id;

        for (const round of game.rounds) {
          for (const match of round.matches) {
            const currentUserInMatch = match.teams.some((team) =>
              team.players.some((p) => p.userId === currentUserId)
            );
            const otherUserInMatch = match.teams.some((team) =>
              team.players.some((p) => p.userId === otherUserId)
            );

            if (!currentUserInMatch || !otherUserInMatch) {
              continue;
            }

            if (sameFixedTeam) {
              addScoredComparisonMatchStats(
                comparisonBuckets,
                currentUserId,
                otherUserId,
                match,
                'together',
              );
            } else {
              addScoredComparisonMatchStats(
                comparisonBuckets,
                currentUserId,
                otherUserId,
                match,
                'against',
              );
            }
          }
        }
      } else {
        addStatsFromMatchTeamsOnly(game);
      }
    } else {
      addStatsFromMatchTeamsOnly(game);
    }
  }

  const seenGameIds = new Set<string>();
  const gamesAgainstEachOther: any[] = [];
  for (const participant of gamesTogether) {
    const game = participant.game;
    if (seenGameIds.has(game.id)) continue;
    seenGameIds.add(game.id);
    const serialized = serializeComparisonGame(game, currentUserId, otherUserId);
    if (serialized) gamesAgainstEachOther.push(serialized);
  }
  gamesAgainstEachOther.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  const coplayedGamesCount = gamesAgainstEachOther.length;

  const [currentUserStats, otherUserStats] = await Promise.all([
    getUserGameOutcomeAggregates(currentUserId, sport),
    getUserGameOutcomeAggregates(otherUserId, sport),
  ]);
  const { together, against } = comparisonBuckets;

  res.json({
    success: true,
    data: {
      sport,
      otherUser,
      gamesTogether: {
        total: together.total,
        gamesCoplayed: coplayedGamesCount,
        wins: together.wins,
        losses: together.losses,
        ties: together.ties,
        winRate: together.total > 0 ? ((together.wins / together.total) * 100).toFixed(1) : '0',
      },
      gamesAgainst: {
        total: against.total,
        wins: against.wins,
        losses: against.losses,
        ties: against.ties,
        winRate: against.total > 0 ? ((against.wins / against.total) * 100).toFixed(1) : '0',
      },
      gamesAgainstEachOther,
      currentUserStats,
      otherUserStats,
    },
  });
});
