import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS, USER_STATS_TARGET_SELECT } from '../../utils/constants';
import { getUserGameOutcomeAggregates } from '../../services/user/userGameOutcomeStats.service';
import { EntityType, ParticipantRole } from '@prisma/client';
import { BasicUser } from '../../types/user.types';

type ParticipantWithUser = {
  id: string;
  userId: string;
  role: ParticipantRole;
  status?: string;
  isPlaying?: boolean;
  joinedAt: Date;
  stats: any;
  user: BasicUser;
};

function serializeComparisonGame(
  game: {
    id: string;
    name: string | null;
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
  otherUserId: string
) {
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
      user: p.user,
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
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_STATS_TARGET_SELECT,
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  let approvedByUser = null;
  if (req.userId && user.approvedById) {
    approvedByUser = await prisma.user.findUnique({
      where: { id: user.approvedById },
      select: USER_SELECT_FIELDS,
    });
  }

  const levelHistory = await prisma.gameOutcome.findMany({
    where: { userId },
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

  const { gamesLast30Days, gamesStats } = await getUserGameOutcomeAggregates(userId);

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

  const baseUser = { ...user, isFavorite: !!isFavorite, approvedBy: approvedByUser };
  if (!req.userId) {
    delete (baseUser as { telegramId?: unknown }).telegramId;
    delete (baseUser as { telegramUsername?: unknown }).telegramUsername;
  }

  res.json({
    success: true,
    data: {
      user: baseUser,
      levelHistory: levelHistory.reverse(),
      gamesLast30Days,
      followersCount,
      followingCount,
      gamesStats,
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

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: USER_SELECT_FIELDS,
  });

  if (!otherUser) {
    throw new ApiError(404, 'Other user not found');
  }

  const gamesTogether = await prisma.gameParticipant.findMany({
    where: {
      userId: currentUserId,
      status: 'PLAYING',
      game: {
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
                select: USER_SELECT_FIELDS,
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
                },
              },
            },
          },
        },
      },
    },
  });

  let matchesTogetherCount = 0;
  let matchesAgainstCount = 0;
  let winsTogether = 0;
  let lossesTogether = 0;
  let winsAgainst = 0;
  let lossesAgainst = 0;

  const addStatsFromMatchTeamsOnly = (game: (typeof gamesTogether)[0]['game']): boolean => {
    let playedAgainst = false;
    for (const round of game.rounds) {
      for (const match of round.matches) {
        const currentUserTeam = match.teams.find((team) =>
          team.players.some((p) => p.userId === currentUserId)
        );
        const otherUserTeam = match.teams.find((team) =>
          team.players.some((p) => p.userId === otherUserId)
        );

        if (!currentUserTeam || !otherUserTeam) {
          continue;
        }

        if (currentUserTeam.id === otherUserTeam.id) {
          matchesTogetherCount++;
          if (match.winnerId === currentUserTeam.id) {
            winsTogether++;
          } else if (match.winnerId) {
            lossesTogether++;
          }
        } else {
          matchesAgainstCount++;
          playedAgainst = true;
          if (match.winnerId === currentUserTeam.id) {
            winsAgainst++;
          } else if (match.winnerId === otherUserTeam.id) {
            lossesAgainst++;
          }
        }
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
              matchesTogetherCount++;
              const currentUserTeamInMatch = match.teams.find((team) =>
                team.players.some((p) => p.userId === currentUserId)
              );
              if (currentUserTeamInMatch && match.winnerId === currentUserTeamInMatch.id) {
                winsTogether++;
              } else if (match.winnerId) {
                lossesTogether++;
              }
            } else {
              const currentUserTeamInMatch = match.teams.find((team) =>
                team.players.some((p) => p.userId === currentUserId)
              );
              const otherUserTeamInMatch = match.teams.find((team) =>
                team.players.some((p) => p.userId === otherUserId)
              );

              if (
                currentUserTeamInMatch &&
                otherUserTeamInMatch &&
                currentUserTeamInMatch.id !== otherUserTeamInMatch.id
              ) {
                matchesAgainstCount++;
                if (match.winnerId === currentUserTeamInMatch.id) {
                  winsAgainst++;
                } else if (match.winnerId === otherUserTeamInMatch.id) {
                  lossesAgainst++;
                }
              }
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
    getUserGameOutcomeAggregates(currentUserId),
    getUserGameOutcomeAggregates(otherUserId),
  ]);

  res.json({
    success: true,
    data: {
      otherUser,
      gamesTogether: {
        total: matchesTogetherCount,
        gamesCoplayed: coplayedGamesCount,
        wins: winsTogether,
        losses: lossesTogether,
        winRate: matchesTogetherCount > 0 ? ((winsTogether / matchesTogetherCount) * 100).toFixed(1) : '0',
      },
      gamesAgainst: {
        total: matchesAgainstCount,
        wins: winsAgainst,
        losses: lossesAgainst,
        winRate: matchesAgainstCount > 0 ? ((winsAgainst / matchesAgainstCount) * 100).toFixed(1) : '0',
      },
      gamesAgainstEachOther,
      currentUserStats,
      otherUserStats,
    },
  });
});

