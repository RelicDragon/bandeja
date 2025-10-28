import prisma from '../config/database';
import { EntityType } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

export class GameService {
  static async calculateGameReadiness(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { isPlaying: true },
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
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    // Calculate participantsReady: check if we have exactly maxParticipants playing participants
    const playingParticipantsCount = game.participants.length;
    const participantsReady = playingParticipantsCount === game.maxParticipants;

    // Calculate teamsReady: check if hasFixedTeams and all teams have players
    let teamsReady = false;
    if (game.hasFixedTeams && game.fixedTeams.length > 0) {
      // Check that all teams have players
      const allTeamsHavePlayers = game.fixedTeams.every(team => team.players.length > 0);
      
      // Check that all players in fixed teams are playing participants
      // Note: game.participants is already filtered to isPlaying: true
      const allPlayersArePlayingParticipants = game.fixedTeams.every(team =>
        team.players.every(player => {
          // Check if this team player is in the playing participants list
          return game.participants.some(p => p.userId === player.userId);
        })
      );
      
      teamsReady = allTeamsHavePlayers && allPlayersArePlayingParticipants;
      
      console.log('Calculated teamsReady:', {
        gameId: game.id,
        hasFixedTeams: game.hasFixedTeams,
        fixedTeamsCount: game.fixedTeams.length,
        allTeamsHavePlayers,
        allPlayersArePlayingParticipants,
        teamsReady,
        participants: game.participants.map(p => ({ userId: p.userId, isPlaying: p.isPlaying })),
        fixedTeams: game.fixedTeams.map(team => ({
          teamNumber: team.teamNumber,
          players: team.players.map(p => ({ userId: p.userId }))
        }))
      });
    }

    return {
      participantsReady,
      teamsReady,
    };
  }

  static async updateGameReadiness(gameId: string) {
    const readiness = await this.calculateGameReadiness(gameId);

    return await prisma.game.update({
      where: { id: gameId },
      data: {
        participantsReady: readiness.participantsReady,
        teamsReady: readiness.teamsReady,
      },
    });
  }

  static async createGame(data: any, userId: string) {
    const entityType = data.entityType || EntityType.GAME;
    const maxParticipants = entityType === EntityType.BAR ? 999 : (data.maxParticipants || 4);
    
    // Validate club selection based on entity type
    if (data.clubId) {
      const club = await prisma.club.findUnique({
        where: { id: data.clubId },
        select: { id: true, isBar: true, isForPlaying: true }
      });

      if (!club) {
        throw new ApiError(404, 'Club not found');
      }

      if (entityType === EntityType.BAR && !club.isBar) {
        throw new ApiError(400, 'This club is not available for bar events');
      }

      if (entityType !== EntityType.BAR && !club.isForPlaying) {
        throw new ApiError(400, 'This club is not available for playing games');
      }
    }
    
    const createdGame = await prisma.game.create({
      data: {
        entityType: entityType,
        gameType: data.gameType,
        name: data.name,
        description: data.description,
        clubId: data.clubId,
        courtId: data.courtId,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        maxParticipants: maxParticipants,
        minParticipants: data.minParticipants || 2,
        minLevel: data.minLevel,
        maxLevel: data.maxLevel,
        isPublic: data.isPublic !== undefined ? data.isPublic : true,
        affectsRating: data.affectsRating !== undefined ? data.affectsRating : true,
        anyoneCanInvite: data.anyoneCanInvite || false,
        resultsByAnyone: data.resultsByAnyone || false,
        hasBookedCourt: data.hasBookedCourt || false,
        afterGameGoToBar: data.afterGameGoToBar || false,
        hasFixedTeams: data.hasFixedTeams || false,
        metadata: data.metadata,
        participants: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        court: {
          include: {
            club: {
              select: {
                name: true,
                address: true,
              },
            },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
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
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    // Update readiness status after game creation
    await this.updateGameReadiness(createdGame.id);

    // Return the game with updated readiness status
    return await prisma.game.findUnique({
      where: { id: createdGame.id },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        court: {
          include: {
            club: {
              select: {
                name: true,
                address: true,
              },
            },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
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
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });
  }

  static async getGameById(id: string, userId?: string) {
    const game = await prisma.game.findUnique({
      where: { id },
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
            club: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
            },
          },
        },
        invites: {
          where: {
            status: 'PENDING',
          },
          include: {
            receiver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
            },
          },
        },
        outcomes: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
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
                  },
                },
                sets: {
                  orderBy: { setNumber: 'asc' },
                },
              },
              orderBy: { matchNumber: 'asc' },
            },
          },
          orderBy: { roundNumber: 'asc' },
        },
        fixedTeams: {
          include: {
            players: {
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
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    // Check if club is favorite for the current user
    let isClubFavorite = false;
    if (userId) {
      const clubId = game.court?.club?.id || game.club?.id;
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

    // Calculate and update readiness status
    await this.updateGameReadiness(id);

    // Get the updated game with readiness fields
    const updatedGame = await prisma.game.findUnique({
      where: { id },
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
            club: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
            },
          },
        },
        invites: {
          where: {
            status: 'PENDING',
          },
          include: {
            receiver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
            },
          },
        },
        outcomes: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
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
                  },
                },
                sets: {
                  orderBy: { setNumber: 'asc' },
                },
              },
              orderBy: { matchNumber: 'asc' },
            },
          },
          orderBy: { roundNumber: 'asc' },
        },
        fixedTeams: {
          include: {
            players: {
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
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    if (!updatedGame) {
      throw new ApiError(404, 'Game not found');
    }

    console.log('Returning game with readiness:', {
      id: updatedGame.id,
      teamsReady: updatedGame.teamsReady,
      participantsReady: updatedGame.participantsReady,
      hasFixedTeams: updatedGame.hasFixedTeams
    });

    return {
      ...updatedGame,
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
          where: { isPlaying: true },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                level: true,
                gender: true,
              },
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

    // Calculate readiness for each game
    const gamesWithReadiness = games.map(game => {
      // Calculate participantsReady: check if we have exactly maxParticipants playing participants
      const playingParticipantsCount = game.participants.length;
      const participantsReady = playingParticipantsCount === game.maxParticipants;

      // Calculate teamsReady: check if hasFixedTeams and all teams have players
      let teamsReady = false;
      if (game.hasFixedTeams && game.fixedTeams.length > 0) {
        // Check that all teams have players and all players are playing participants
        const allTeamsHavePlayers = game.fixedTeams.every((team: any) => team.players.length > 0);
        const allPlayersAreParticipants = game.fixedTeams.every((team: any) =>
          team.players.every((player: any) => {
            const participant = game.participants.find((p: any) => p.userId === player.userId);
            return participant !== undefined;
          })
        );
        teamsReady = allTeamsHavePlayers && allPlayersAreParticipants;
      }

      return {
        ...game,
        participantsReady,
        teamsReady,
      };
    });

    return gamesWithReadiness;
  }

  static async updateGame(id: string, data: any, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId: id,
        userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!participant) {
      throw new ApiError(403, 'Only owners and admins can update the game');
    }

    await prisma.game.update({
      where: { id },
      data,
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
                gender: true,
              },
            },
          },
        },
      },
    });

    // Update readiness status after game update
    await this.updateGameReadiness(id);

    // Return the game with updated readiness status
    return await prisma.game.findUnique({
      where: { id },
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
                gender: true,
              },
            },
          },
        },
      },
    });
  }

  static async deleteGame(id: string, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId: id,
        userId,
        role: 'OWNER',
      },
    });

    if (!participant) {
      throw new ApiError(403, 'Only the owner can delete the game');
    }

    // Get the game with mediaUrls before deleting
    const game = await prisma.game.findUnique({
      where: { id },
      select: { mediaUrls: true }
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    // Delete media files if they exist
    if (game.mediaUrls && game.mediaUrls.length > 0) {
      const { ImageProcessor } = await import('../utils/imageProcessor');
      for (const mediaUrl of game.mediaUrls) {
        try {
          // Delete the original file
          await ImageProcessor.deleteFile(mediaUrl);
          
          // Try to delete the corresponding thumbnail file
          // Game media thumbnails follow the pattern: /uploads/games/thumbnails/{filename}_thumb.{ext}
          const thumbnailUrl = mediaUrl.replace('/originals/', '/thumbnails/').replace(/(\.[^.]+)$/, '_thumb$1');
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    await prisma.game.delete({
      where: { id },
    });
  }
}
