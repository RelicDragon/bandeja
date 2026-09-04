import { Response } from 'express';
import { ParticipantStatus, Prisma, Sport } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import {
  parseSportParam,
  projectUserForSportContext,
} from '../../services/user/userSportProfile.service';
import { projectEmbeddedUserByPrimarySport } from '../../services/user/projectEmbeddedBasicUsers';
import { BasicUser } from '../../types/user.types';
import { CommonChatsService } from '../../services/user/commonChats.service';
import { expandNameSearchTerms } from '../../utils/nameSearchTerms';
import { findUserIdsBusyInSlot } from '../../services/game/gameSlotOverlap.service';
import { rankNearbyCities } from '../../services/user/nearbyCities';

const INVITE_PICKER_BLOCKING_PARTICIPANT_STATUSES = new Set<ParticipantStatus>([
  ParticipantStatus.PLAYING,
  ParticipantStatus.NON_PLAYING,
  ParticipantStatus.IN_QUEUE,
  ParticipantStatus.GUEST,
  ParticipantStatus.INVITED,
]);

export const getInvitablePlayers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, sport: sportQuery } = req.query;
  const searchInput = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
  const searchTerm = typeof searchInput === 'string' ? searchInput.trim() : '';
  const searchTerms = searchTerm.split(/\s+/).filter(Boolean).slice(0, 5);
  const requestedCityIdRaw = Array.isArray(req.query.cityId) ? req.query.cityId[0] : req.query.cityId;
  const requestedCityId = typeof requestedCityIdRaw === 'string' ? requestedCityIdRaw.trim() : '';
  const expandNearbyRaw = Array.isArray(req.query.expandNearby)
    ? req.query.expandNearby[0]
    : req.query.expandNearby;
  const expandNearby =
    expandNearbyRaw === '1' || expandNearbyRaw === 'true';
  const startTimeInput = Array.isArray(req.query.startTime) ? req.query.startTime[0] : req.query.startTime;
  const endTimeInput = Array.isArray(req.query.endTime) ? req.query.endTime[0] : req.query.endTime;
  const slotStart = typeof startTimeInput === 'string' ? new Date(startTimeInput) : null;
  const slotEnd = typeof endTimeInput === 'string' ? new Date(endTimeInput) : null;
  const querySlot =
    slotStart &&
    slotEnd &&
    Number.isFinite(slotStart.getTime()) &&
    Number.isFinite(slotEnd.getTime()) &&
    slotStart < slotEnd
      ? { startTime: slotStart, endTime: slotEnd }
      : null;
  const searchWhere: Prisma.UserWhereInput =
    searchTerms.length > 0
      ? {
          AND: searchTerms.map((term) => ({
            OR: expandNameSearchTerms(term).flatMap((variant) => [
              { firstName: { contains: variant, mode: 'insensitive' as const } },
              { lastName: { contains: variant, mode: 'insensitive' as const } },
              { telegramUsername: { contains: variant, mode: 'insensitive' as const } },
            ]),
          })),
        }
      : {};

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { currentCityId: true },
  });

  let participantIds: string[] = [];
  let cityId = currentUser?.currentCityId;
  let gameSport: Sport | null = null;
  let busyUserIds: string[] = [];

  if (!cityId) {
    throw new ApiError(400, 'User does not have a city');
  }

  if (requestedCityId) {
    const browseCity = await prisma.city.findUnique({
      where: { id: requestedCityId },
      select: { id: true, isActive: true },
    });
    if (!browseCity?.isActive) {
      throw new ApiError(400, 'City is required');
    }
    cityId = browseCity.id;
  }

  if (gameId) {
    const game = await prisma.game.findUnique({
      where: { id: gameId as string },
      select: {
        id: true,
        sport: true,
        cityId: true,
        startTime: true,
        endTime: true,
        timeIsSet: true,
        participants: {
          select: {
            userId: true,
            status: true,
          },
        },
        club: {
          select: {
            cityId: true,
          },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    const gameCityId = game.club?.cityId ?? game.cityId;

    if (!requestedCityId && gameCityId !== cityId) {
      throw new ApiError(400, 'Game is not in your city');
    }

    participantIds = game.participants
      .filter((p) => INVITE_PICKER_BLOCKING_PARTICIPANT_STATUSES.has(p.status))
      .map((p) => p.userId);
    if (!requestedCityId) {
      cityId = gameCityId || currentUser?.currentCityId;
    }
    gameSport = game.sport ?? Sport.PADEL;
    busyUserIds = await findUserIdsBusyInSlot({
      id: game.id,
      startTime: game.startTime,
      endTime: game.endTime,
      timeIsSet: game.timeIsSet,
    });
  } else {
    if (querySlot) {
      busyUserIds = await findUserIdsBusyInSlot({
        id: '',
        startTime: querySlot.startTime,
        endTime: querySlot.endTime,
        timeIsSet: true,
      });
    }
    if (sportQuery) {
      gameSport = parseSportParam(sportQuery);
    }
  }

  const interactions = await prisma.userInteraction.findMany({
    where: { fromUserId: req.userId },
    select: {
      toUserId: true,
      count: true,
    },
  });

  const interactionMap = new Map(interactions.map((i: { toUserId: string; count: number }) => [i.toUserId, i.count]));

  const coplayRows = await prisma.$queryRaw<Array<{ userId: string; count: number }>>(
    Prisma.sql`
      SELECT gp2."userId" AS "userId", COUNT(DISTINCT g.id)::int AS count
      FROM "GameParticipant" gp1
      INNER JOIN "GameParticipant" gp2 ON gp1."gameId" = gp2."gameId"
      INNER JOIN "Game" g ON g.id = gp1."gameId"
      WHERE gp1."userId" = ${req.userId}
        AND gp1.status = 'PLAYING'::"ParticipantStatus"
        AND gp2.status = 'PLAYING'::"ParticipantStatus"
        AND gp2."userId" <> gp1."userId"
        AND g."resultsStatus" = 'FINAL'::"ResultsStatus"
        AND g."entityType" NOT IN ('BAR'::"EntityType", 'LEAGUE_SEASON'::"EntityType")
      GROUP BY gp2."userId"
    `
  );

  const gamesTogetherMap = new Map(coplayRows.map((r) => [r.userId, r.count]));
  const excludedIds = [...new Set([...participantIds, ...busyUserIds, req.userId!])];

  const loadCityUsers = async (targetCityId: string, take: number) => {
    const users = await prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        isActive: true,
        currentCityId: targetCityId,
        ...searchWhere,
      },
      select: USER_SELECT_WITH_SPORT_PROFILES,
      orderBy: searchTerms.length > 0 ? [{ firstName: 'asc' }, { lastName: 'asc' }] : undefined,
      take,
    });
    const mapped = users.map((user) => {
      const withMeta = {
        ...user,
        interactionCount: interactionMap.get(user.id) || 0,
        gamesTogetherCount: gamesTogetherMap.get(user.id) || 0,
      };
      const projected = gameSport
        ? projectUserForSportContext(withMeta, gameSport, { keepSportProfiles: true })
        : projectEmbeddedUserByPrimarySport(withMeta, { keepSportProfiles: true });
      return {
        ...projected,
        sportsEnabled: user.sportsEnabled ?? [Sport.PADEL],
        interactionCount: withMeta.interactionCount,
        gamesTogetherCount: withMeta.gamesTogetherCount,
      } as BasicUser & { interactionCount: number; gamesTogetherCount: number; sportsEnabled: Sport[] };
    });
    mapped.sort((a, b) => b.interactionCount - a.interactionCount);
    return mapped;
  };

  const [socialAgg, usersWithInteractions] = await Promise.all([
    prisma.user.aggregate({
      where: { isActive: true },
      _max: { socialLevel: true },
    }),
    loadCityUsers(cityId!, 5000),
  ]);

  const maxSocialLevel = Math.max(socialAgg._max.socialLevel ?? 1, 1);

  const nearby: Array<{
    cityId: string;
    name: string;
    country: string;
    km: number;
    players: typeof usersWithInteractions;
  }> = [];

  if (expandNearby && searchTerms.length > 0 && usersWithInteractions.length === 0 && cityId) {
    const cities = await prisma.city.findMany({
      where: { isActive: true, isCorrect: true, latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true,
        name: true,
        country: true,
        administrativeArea: true,
        subAdministrativeArea: true,
        latitude: true,
        longitude: true,
      },
    });
    const anchor = cities.find((city) => city.id === cityId);
    if (anchor?.latitude != null && anchor.longitude != null) {
      const ranked = rankNearbyCities(
        {
          id: anchor.id,
          name: anchor.name,
          country: anchor.country,
          administrativeArea: anchor.administrativeArea,
          subAdministrativeArea: anchor.subAdministrativeArea,
          latitude: anchor.latitude,
          longitude: anchor.longitude,
        },
        cities.map((city) => ({
          id: city.id,
          name: city.name,
          country: city.country,
          administrativeArea: city.administrativeArea,
          subAdministrativeArea: city.subAdministrativeArea,
          latitude: city.latitude as number,
          longitude: city.longitude as number,
        })),
      );
      for (const city of ranked) {
        const players = await loadCityUsers(city.id, 20);
        if (players.length === 0) continue;
        nearby.push({
          cityId: city.id,
          name: city.name,
          country: city.country,
          km: Math.round(city.km),
          players,
        });
      }
    }
  }

  res.json({
    success: true,
    data: {
      cityId,
      players: usersWithInteractions,
      nearby,
      maxSocialLevel,
      busyUserIds,
    },
  });
});

export const trackUserInteraction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { targetUserId } = req.body;

  if (!targetUserId) {
    throw new ApiError(400, 'Target user ID is required');
  }

  if (targetUserId === req.userId) {
    throw new ApiError(400, 'Cannot track interaction with yourself');
  }

  const interaction = await prisma.userInteraction.upsert({
    where: {
      fromUserId_toUserId: {
        fromUserId: req.userId!,
        toUserId: targetUserId,
      },
    },
    update: {
      count: {
        increment: 1,
      },
      lastInteractionAt: new Date(),
    },
    create: {
      fromUserId: req.userId!,
      toUserId: targetUserId,
      count: 1,
      lastInteractionAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: interaction,
  });
});

export const getCommonGroupChannels = asyncHandler(async (req: AuthRequest, res: Response) => {
  const otherUserId = req.params.userId;
  if (!otherUserId) {
    throw new ApiError(400, 'User ID is required');
  }

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true },
  });
  if (!otherUser) {
    throw new ApiError(404, 'User not found');
  }

  const chats = await CommonChatsService.getCommonChats(req.userId!, otherUserId);
  res.json({ success: true, data: chats });
});
