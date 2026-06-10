import prisma from '../../config/database';
import { ClubIntegrationType, EntityType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS_WITH_SPORT_PROFILES, SUPPORTED_CURRENCIES } from '../../utils/constants';
import { calculateGameStatus } from '../../utils/gameStatus';
import { GameReadinessService } from './readiness.service';
import { canAddPlayerToGame } from '../../utils/participantValidation';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import notificationService from '../notification.service';
import { validateGameForSport } from '../../utils/validators/validateGameForSport';
import { resolvePlayersPerMatch, resolveSport } from '../../sport/sportRegistry';
import { normalizeGameFormatPatch } from '../../utils/gameFormat/normalizeGameFormatPatch';
import { resolveMatchGenerationType } from '../../utils/game/resolveMatchGenerationType';
import { assertMaxParticipantsWithinUserCap } from '../../utils/game/userMaxParticipantsCap';
import { projectUserForSportContext, touchLastCreatedSport } from '../user/userSportProfile.service';

export class GameCreateService {
  static async createGame(data: any, userId: string, jwtIsAdmin: boolean = false) {
    // Validate currency if provided
    if (data.priceCurrency && !SUPPORTED_CURRENCIES.includes(data.priceCurrency)) {
      throw new ApiError(400, `Invalid currency. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }

    if (data.mainPhotoId !== undefined && data.mainPhotoId !== null) {
      throw new ApiError(400, 'mainPhotoId cannot be set when creating a game');
    }

    let entityType = data.entityType || EntityType.GAME;
    let maxParticipants = entityType === EntityType.BAR ? 999 : (data.maxParticipants || 4);
    if (entityType === EntityType.GAME && maxParticipants >= 8) {
      entityType = EntityType.TOURNAMENT;
    }

    if (entityType !== EntityType.BAR) {
      const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { canCreateTournament: true, maxParticipantsInGame: true },
      });
      assertMaxParticipantsWithinUserCap({
        jwtIsAdmin,
        actor,
        maxParticipants,
        entityType,
      });
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
    
    const isTraining = entityType === EntityType.TRAINING;
    const sportEarly = resolveSport(data.sport);
    let playersPerMatchEarly = isTraining
      ? resolvePlayersPerMatch(sportEarly, undefined)
      : resolvePlayersPerMatch(sportEarly, data.playersPerMatch);
    if (!isTraining && data.playersPerMatch == null && maxParticipants === 2) {
      playersPerMatchEarly = 2;
    }
    const singlesEvent = maxParticipants === 2 || playersPerMatchEarly === 2;
    const hasFixedTeams = singlesEvent ? false : (data.hasFixedTeams || false);
    const allowUserInMultipleTeams = singlesEvent ? false : Boolean(data.allowUserInMultipleTeams);
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
    const creatorNonPlaying = entityType === EntityType.TRAINING && (data.creatorNonPlaying === true);

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
    
    const gameType = isTraining ? 'CLASSIC' : data.gameType;

    let trainerId: string | null = null;
    if (entityType === EntityType.TRAINING) {
      if (creatorNonPlaying) {
        trainerId = userId;
      } else {
        const creator = await prisma.user.findUnique({
          where: { id: userId },
          select: { isTrainer: true },
        });
        if (creator?.isTrainer) {
          trainerId = userId;
        }
      }
    }

    const minParticipantsCreate = isTraining ? 1 : (data.minParticipants || 2);

    const sport = validateGameForSport({
      sport: data.sport,
      entityType,
      gameType,
      matchGenerationType: data.matchGenerationType,
      maxParticipants,
      minParticipants: minParticipantsCreate,
      playersPerMatch: isTraining ? undefined : playersPerMatchEarly,
      scoringPreset: isTraining ? undefined : data.scoringPreset,
    });
    const playersPerMatch = playersPerMatchEarly;

    const formatNorm = isTraining
      ? {}
      : normalizeGameFormatPatch({
          existingGame: {
            gameType,
            sport,
            playersPerMatch,
            hasFixedTeams,
            allowUserInMultipleTeams,
            maxParticipants,
          },
          patch: data,
          entityType,
        });
    const scoringPreset = isTraining ? null : (formatNorm.scoringPreset as typeof data.scoringPreset) ?? null;
    const winnerOfMatchCreate = (formatNorm.winnerOfMatch as string | undefined) ?? data.winnerOfMatch ?? 'BY_SCORES';
    const maxTotalPointsCreate =
      (formatNorm.maxTotalPointsPerSet as number | undefined) ?? data.maxTotalPointsPerSet ?? 0;
    const matchTimerEnabled = Boolean(formatNorm.matchTimerEnabled ?? data.matchTimerEnabled);
    const matchTimedCapMinutes = (formatNorm.matchTimedCapMinutes as number | undefined) ?? 0;
    const ballsInGames = Boolean(formatNorm.ballsInGames);
    const fixedSetsCreate = data.fixedNumberOfSets ?? 0;

    const affectsRatingCreate =
      data.affectsRating !== undefined
        ? data.affectsRating
        : true;

    const externalBookingId =
      typeof data.externalBookingId === 'string' && data.externalBookingId.trim()
        ? data.externalBookingId.trim()
        : null;
    let externalBookingProvider: ClubIntegrationType | null = null;
    if (externalBookingId) {
      const provider = data.externalBookingProvider;
      if (provider !== ClubIntegrationType.BOOKTIME) {
        throw new ApiError(400, 'externalBookingProvider must be BOOKTIME when externalBookingId is set');
      }
      externalBookingProvider = ClubIntegrationType.BOOKTIME;
    }
    const hasBookedCourtCreate = externalBookingId ? true : Boolean(data.hasBookedCourt);

    const createdGame = await prisma.game.create({
      data: {
        entityType: entityType,
        sport,
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
        playersPerMatch,
        minParticipants: minParticipantsCreate,
        minLevel: data.minLevel,
        maxLevel: data.maxLevel,
        isPublic: data.isPublic !== undefined ? data.isPublic : true,
        affectsRating: affectsRatingCreate,
        anyoneCanInvite: data.anyoneCanInvite || false,
        resultsByAnyone: entityType === EntityType.TOURNAMENT ? false : (data.resultsByAnyone || false),
        allowDirectJoin: data.allowDirectJoin || false,
        hasBookedCourt: hasBookedCourtCreate,
        externalBookingId,
        externalBookingProvider,
        afterGameGoToBar: data.afterGameGoToBar || false,
        hasFixedTeams: (formatNorm.hasFixedTeams as boolean | undefined) ?? hasFixedTeams,
        allowUserInMultipleTeams:
          (formatNorm.allowUserInMultipleTeams as boolean | undefined) ?? allowUserInMultipleTeams,
        genderTeams: data.genderTeams || 'ANY',
        fixedNumberOfSets: fixedSetsCreate,
        maxTotalPointsPerSet: maxTotalPointsCreate,
        matchTimedCapMinutes,
        matchTimerEnabled,
        maxPointsPerTeam: data.maxPointsPerTeam ?? 0,
        winnerOfGame: data.winnerOfGame ?? 'BY_MATCHES_WON',
        winnerOfMatch: winnerOfMatchCreate,
        matchGenerationType:
          (formatNorm.matchGenerationType as typeof data.matchGenerationType | undefined) ??
          resolveMatchGenerationType({
            resultsRoundGenV2: data.resultsRoundGenV2,
            matchGenerationType: data.matchGenerationType,
            maxParticipants,
            playersPerMatch,
          }),
        pointsPerWin: data.pointsPerWin ?? 0,
        pointsPerLoose: data.pointsPerLoose ?? 0,
        pointsPerTie: data.pointsPerTie ?? 0,
        ballsInGames,
        scoringPreset,
        scoringMode: (formatNorm.scoringMode as string | null | undefined) ?? data.scoringMode ?? null,
        hasGoldenPoint: Boolean(formatNorm.hasGoldenPoint ?? data.hasGoldenPoint),
        priceTotal: (priceType === 'NOT_KNOWN' || priceType === 'FREE') ? null : priceTotal,
        priceType: priceType,
        priceCurrency: (priceType === 'NOT_KNOWN' || priceType === 'FREE') ? null : data.priceCurrency,
        metadata: data.metadata,
        timeIsSet: data.timeIsSet ?? false,
        status: calculateGameStatus({
          startTime,
          endTime,
          resultsStatus: 'NONE',
          timeIsSet: data.timeIsSet ?? false,
          entityType: entityType,
        }, cityTimezone),
        ...(trainerId && { trainerId }),
        participants: {
          create: {
            userId,
            role: 'OWNER',
            status: creatorNonPlaying || !ownerIsPlaying ? 'NON_PLAYING' : 'PLAYING',
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
              select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES,
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES,
                },
              },
            },
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    await GameReadinessService.updateGameReadiness(createdGame.id);
    await touchLastCreatedSport(userId, sport);

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
              select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES,
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES,
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

    if (!finalGame) return finalGame;

    const gameSport = finalGame.sport;
    return {
      ...finalGame,
      participants: finalGame.participants.map((participant) => ({
        ...participant,
        user: projectUserForSportContext(participant.user, gameSport),
      })),
      fixedTeams: finalGame.fixedTeams.map((team) => ({
        ...team,
        players: team.players.map((player) => ({
          ...player,
          user: projectUserForSportContext(player.user, gameSport),
        })),
      })),
    };
  }
}

