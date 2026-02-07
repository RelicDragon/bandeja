import prisma from '../../config/database';
import { EntityType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { calculateGameStatus } from '../../utils/gameStatus';
import { GameReadinessService } from './readiness.service';
import { canAddPlayerToGame } from '../../utils/participantValidation';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import notificationService from '../notification.service';

export class GameCreateService {
  static async createGame(data: any, userId: string) {
    let entityType = data.entityType || EntityType.GAME;
    let maxParticipants = entityType === EntityType.BAR ? 999 : (data.maxParticipants || 4);
    if (entityType === EntityType.GAME && maxParticipants >= 8) {
      entityType = EntityType.TOURNAMENT;
    }
    
    let cityId: string | null = null;

    if (data.cityId) {
      cityId = data.cityId;
    } else if (data.clubId) {
      const club = await prisma.club.findUnique({
        where: { id: data.clubId },
        select: { id: true, isBar: true, isForPlaying: true, cityId: true }
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

      cityId = club.cityId;
    } else if (data.courtId) {
      const court = await prisma.court.findUnique({
        where: { id: data.courtId },
        select: { 
          id: true,
          club: {
            select: { cityId: true }
          }
        }
      });

      if (!court) {
        throw new ApiError(404, 'Court not found');
      }

      cityId = court.club.cityId;
    }

    if (!cityId) {
      throw new ApiError(400, 'City ID is required. Provide cityId directly or through clubId/courtId');
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
    const creator = entityType === EntityType.TRAINING
      ? await prisma.user.findUnique({ where: { id: userId }, select: { isTrainer: true } })
      : null;

    if (ownerIsPlaying) {
      const tempGame = {
        id: 'temp',
        genderTeams: (data.genderTeams || 'ANY') as any,
        maxParticipants: maxParticipants,
        entityType: entityType,
        participants: [],
      };
      const joinResult = await canAddPlayerToGame(tempGame, userId);
      if (!joinResult.canJoin) {
        throw new ApiError(400, joinResult.reason || 'Owner cannot join this game');
      }
    }
    
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    
    const priceType = data.priceType ?? 'NOT_KNOWN';
    const priceTotal = data.priceTotal;
    
    if (priceType === 'PER_PERSON' || priceType === 'PER_TEAM' || priceType === 'TOTAL') {
      if (priceTotal === null || priceTotal === undefined || priceTotal <= 0) {
        throw new ApiError(400, 'Price must be greater than 0 when price type is PER_PERSON, PER_TEAM, or TOTAL');
      }
    } else     if (priceType === 'NOT_KNOWN' || priceType === 'FREE') {
      if (priceTotal !== null && priceTotal !== undefined && priceTotal !== 0) {
        throw new ApiError(400, 'Price must be 0 or null when price type is NOT_KNOWN or FREE');
      }
    }
    
    const cityTimezone = await getUserTimezoneFromCityId(cityId);
    
    const gameType = entityType === EntityType.TRAINING 
      ? (data.gameType || 'CLASSIC')
      : data.gameType;
    
    const createdGame = await prisma.game.create({
      data: {
        entityType: entityType,
        gameType: gameType,
        name: data.name,
        description: data.description,
        avatar: data.avatar,
        originalAvatar: data.originalAvatar,
        clubId: data.clubId,
        courtId: data.courtId,
        cityId: cityId as string,
        startTime: startTime,
        endTime: endTime,
        maxParticipants: maxParticipants,
        minParticipants: data.minParticipants || 2,
        minLevel: data.minLevel,
        maxLevel: data.maxLevel,
        isPublic: data.isPublic !== undefined ? data.isPublic : true,
        affectsRating: data.affectsRating !== undefined ? data.affectsRating : true,
        anyoneCanInvite: data.anyoneCanInvite || false,
        resultsByAnyone: entityType === EntityType.TOURNAMENT ? false : (data.resultsByAnyone || false),
        allowDirectJoin: data.allowDirectJoin || false,
        hasBookedCourt: data.hasBookedCourt || false,
        afterGameGoToBar: data.afterGameGoToBar || false,
        hasFixedTeams: hasFixedTeams,
        genderTeams: data.genderTeams || 'ANY',
        fixedNumberOfSets: data.fixedNumberOfSets ?? 0,
        maxTotalPointsPerSet: data.maxTotalPointsPerSet ?? 0,
        maxPointsPerTeam: data.maxPointsPerTeam ?? 0,
        winnerOfGame: data.winnerOfGame ?? 'BY_MATCHES_WON',
        winnerOfMatch: data.winnerOfMatch ?? 'BY_SCORES',
        matchGenerationType: data.matchGenerationType ?? 'HANDMADE',
        prohibitMatchesEditing: data.prohibitMatchesEditing ?? false,
        pointsPerWin: data.pointsPerWin ?? 0,
        pointsPerLoose: data.pointsPerLoose ?? 0,
        pointsPerTie: data.pointsPerTie ?? 0,
        ballsInGames: data.ballsInGames ?? false,
        priceTotal: (priceType === 'NOT_KNOWN' || priceType === 'FREE') ? null : priceTotal,
        priceType: priceType,
        priceCurrency: (priceType === 'NOT_KNOWN' || priceType === 'FREE') ? null : data.priceCurrency,
        metadata: data.metadata,
        timeIsSet: data.timeIsSet ?? false,
        mainPhotoId: data.mainPhotoId,
        status: calculateGameStatus({
          startTime,
          endTime,
          resultsStatus: 'NONE',
          timeIsSet: data.timeIsSet ?? false,
          entityType: entityType,
        }, cityTimezone),
        participants: {
          create: {
            userId,
            role: 'OWNER',
            status: ownerIsPlaying ? 'PLAYING' : 'IN_QUEUE',
            isTrainer: entityType === EntityType.TRAINING && creator?.isTrainer === true,
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

    const finalGame = await prisma.game.findUnique({
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

    if (finalGame && finalGame.isPublic && finalGame.entityType !== EntityType.LEAGUE && finalGame.entityType !== EntityType.LEAGUE_SEASON) {
      notificationService.sendNewGameNotification(finalGame, cityId, userId).catch((error) => {
        console.error('Failed to send new game notifications:', error);
      });
    }

    return finalGame;
  }
}

