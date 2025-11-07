import prisma from '../../config/database';
import { EntityType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { calculateGameStatus } from '../../utils/gameStatus';
import { GameReadinessService } from './readiness.service';

export class GameCreateService {
  static async createGame(data: any, userId: string) {
    const entityType = data.entityType || EntityType.GAME;
    const maxParticipants = entityType === EntityType.BAR ? 999 : (data.maxParticipants || 4);
    
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
    
    const hasFixedTeams = maxParticipants === 2 ? false : (data.hasFixedTeams || false);
    const genderTeams = data.genderTeams || 'ANY';
    
    if (genderTeams === 'MIX_PAIRS' && !(maxParticipants >= 4 && maxParticipants % 2 === 0)) {
      throw new ApiError(400, 'MIX_PAIRS can only be set for even number of participants (at least 4)');
    }
    
    if (entityType !== EntityType.GAME && entityType !== EntityType.TOURNAMENT && entityType !== EntityType.LEAGUE) {
      if (genderTeams !== 'ANY') {
        throw new ApiError(400, 'Gender teams can only be set for GAME, TOURNAMENT, or LEAGUE entity types');
      }
    }
    
    const participantsList: string[] = Array.isArray(data.participants) 
      ? data.participants.filter((id: string | null): id is string => id !== null)
      : [];
    
    const ownerIsPlaying = participantsList.includes(userId);
    
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    
    const createdGame = await prisma.game.create({
      data: {
        entityType: entityType,
        gameType: data.gameType,
        name: data.name,
        description: data.description,
        clubId: data.clubId,
        courtId: data.courtId,
        startTime: startTime,
        endTime: endTime,
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
        hasFixedTeams: hasFixedTeams,
        genderTeams: data.genderTeams || 'ANY',
        fixedNumberOfSets: data.fixedNumberOfSets ?? 0,
        maxTotalPointsPerSet: data.maxTotalPointsPerSet ?? 0,
        maxPointsPerTeam: data.maxPointsPerTeam ?? 0,
        hasMultiRounds: data.hasMultiRounds ?? false,
        matchGenerationType: data.matchGenerationType ?? 'HANDMADE',
        metadata: data.metadata,
        status: calculateGameStatus({
          startTime,
          endTime,
          resultsStatus: 'NONE',
        }),
        participants: {
          create: {
            userId,
            role: 'OWNER',
            isPlaying: ownerIsPlaying,
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
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    await GameReadinessService.updateGameReadiness(createdGame.id);

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
      },
    });
  }
}

