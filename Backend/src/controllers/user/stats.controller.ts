import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';

export const getUserStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      originalAvatar: true,
      level: true,
      socialLevel: true,
      gender: true,
      reliability: true,
      isAdmin: true,
      isTrainer: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
      createdAt: true,
      preferredHandLeft: true,
      preferredHandRight: true,
      preferredCourtSideLeft: true,
      preferredCourtSideRight: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

  const gamesLast30Days = await prisma.gameOutcome.count({
    where: {
      userId,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const isFavorite = req.userId ? await prisma.userFavoriteUser.findUnique({
    where: {
      userId_favoriteUserId: {
        userId: req.userId,
        favoriteUserId: userId,
      },
    },
  }) : null;

  res.json({
    success: true,
    data: {
      user: {
        ...user,
        isFavorite: !!isFavorite,
        //avatar: user.avatar ? UrlConstructor.constructImageUrl(user.avatar) : user.avatar,
        //originalAvatar: user.originalAvatar ? UrlConstructor.constructImageUrl(user.originalAvatar) : user.originalAvatar,
      },
      levelHistory: levelHistory.reverse(),
      gamesLast30Days,
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
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
    },
  });

  if (!otherUser) {
    throw new ApiError(404, 'Other user not found');
  }

  const gamesTogether = await prisma.gameParticipant.findMany({
    where: {
      userId: currentUserId,
      isPlaying: true,
      game: {
        participants: {
          some: {
            userId: otherUserId,
            isPlaying: true,
          },
        },
        resultsStatus: 'FINAL',
      },
    },
    include: {
      game: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  level: true,
                },
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
  const gamesAgainstEachOther: any[] = [];

  for (const participant of gamesTogether) {
    const game = participant.game;
    const hasFixedTeams = game.hasFixedTeams;
    let playedAgainst = false;

    if (hasFixedTeams && game.fixedTeams.length > 0) {
      const currentUserTeam = game.fixedTeams.find((team) =>
        team.players.some((p) => p.userId === currentUserId)
      );
      const otherUserTeam = game.fixedTeams.find((team) =>
        team.players.some((p) => p.userId === otherUserId)
      );

      if (!currentUserTeam || !otherUserTeam) {
        continue;
      }

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

            if (currentUserTeamInMatch && otherUserTeamInMatch && currentUserTeamInMatch.id !== otherUserTeamInMatch.id) {
              matchesAgainstCount++;
              playedAgainst = true;
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
    }

    if (playedAgainst) {
      const currentUserParticipant = game.participants.find(
        (p: any) => p.userId === currentUserId && p.isPlaying === true
      );
      const otherUserParticipant = game.participants.find(
        (p: any) => p.userId === otherUserId && p.isPlaying === true
      );

      if (currentUserParticipant && otherUserParticipant) {
        gamesAgainstEachOther.push({
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
        participants: game.participants.map((p: any) => ({
          id: p.id,
          userId: p.userId,
          role: p.role,
          isPlaying: p.isPlaying,
          joinedAt: p.joinedAt,
          stats: p.stats,
          user: p.user ? {
            id: p.user.id,
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            avatar: p.user.avatar,
            level: p.user.level,
          } : null,
        })),
        club: game.club ? {
          id: game.club.id,
          name: game.club.name,
          city: game.club.city ? {
            id: game.club.city.id,
            name: game.club.city.name,
          } : null,
        } : null,
        court: game.court ? {
          id: game.court.id,
          name: game.court.name,
          club: game.court.club ? {
            id: game.court.club.id,
            name: game.court.club.name,
            city: game.court.club.city ? {
              id: game.court.club.city.id,
              name: game.court.club.city.name,
            } : null,
          } : null,
        } : null,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
      });
      }
    }
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const currentUserStats = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: {
      gamesPlayed: true,
      gamesWon: true,
    },
  });

  const otherUserStats = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: {
      gamesPlayed: true,
      gamesWon: true,
    },
  });

  const currentUserGamesLast30Days = await prisma.gameOutcome.count({
    where: {
      userId: currentUserId,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const otherUserGamesLast30Days = await prisma.gameOutcome.count({
    where: {
      userId: otherUserId,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const currentUserTotalMatches = await prisma.match.count({
    where: {
      round: {
        game: {
          participants: {
            some: {
              userId: currentUserId,
              isPlaying: true,
            },
          },
          resultsStatus: 'FINAL',
        },
      },
      teams: {
        some: {
          players: {
            some: {
              userId: currentUserId,
            },
          },
        },
      },
    },
  });

  const otherUserTotalMatches = await prisma.match.count({
    where: {
      round: {
        game: {
          participants: {
            some: {
              userId: otherUserId,
              isPlaying: true,
            },
          },
          resultsStatus: 'FINAL',
        },
      },
      teams: {
        some: {
          players: {
            some: {
              userId: otherUserId,
            },
          },
        },
      },
    },
  });

  res.json({
    success: true,
    data: {
      otherUser,
      gamesTogether: {
        total: matchesTogetherCount,
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
      gamesAgainstEachOther: gamesAgainstEachOther.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
      currentUserStats: {
        totalGames: currentUserStats?.gamesPlayed || 0,
        totalMatches: currentUserTotalMatches,
        gamesLast30Days: currentUserGamesLast30Days,
        totalWins: currentUserStats?.gamesWon || 0,
        winsPercentage: currentUserStats?.gamesPlayed && currentUserStats.gamesPlayed > 0
          ? ((currentUserStats.gamesWon / currentUserStats.gamesPlayed) * 100).toFixed(1)
          : '0',
      },
      otherUserStats: {
        totalGames: otherUserStats?.gamesPlayed || 0,
        totalMatches: otherUserTotalMatches,
        gamesLast30Days: otherUserGamesLast30Days,
        totalWins: otherUserStats?.gamesWon || 0,
        winsPercentage: otherUserStats?.gamesPlayed && otherUserStats.gamesPlayed > 0
          ? ((otherUserStats.gamesWon / otherUserStats.gamesPlayed) * 100).toFixed(1)
          : '0',
      },
    },
  });
});

