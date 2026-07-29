import {
  EntityType,
  PlayIntentStatus,
  Prisma,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { PlayIntentService } from './playIntent.service';
import { intentWindowIsReachable } from './playIntentFreshness';

async function loadAccessibleSource(
  intentId: string,
  viewerId: string,
  db: Prisma.TransactionClient = prisma,
) {
  const intent = await db.playIntent.findUnique({
    where: { id: intentId },
    include: {
      city: { select: { id: true, name: true, timezone: true } },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
      gameParticipants: { select: { id: true }, take: 1 },
    },
  });
  if (
    !intent ||
    intent.userId === viewerId ||
    intent.entityType !== EntityType.GAME ||
    (intent.status !== PlayIntentStatus.OPEN &&
      intent.status !== PlayIntentStatus.MATCHED) ||
    intent.gameParticipants.length > 0 ||
    intent.expiresAt <= new Date() ||
    !intentWindowIsReachable(intent, intent.city.timezone)
  ) {
    throw new ApiError(410, 'playIntent.sharedUnavailable', true, {
      code: 'playIntent.sharedUnavailable',
    });
  }

  const follower = await db.userFavoriteUser.findFirst({
    where: {
      userId: viewerId,
      favoriteUserId: intent.userId,
      user: {
        currentCityId: intent.cityId,
        OR:
          intent.sport === Sport.PADEL
            ? [
                { sportsEnabled: { has: intent.sport } },
                { sportsEnabled: { isEmpty: true } },
              ]
            : [{ sportsEnabled: { has: intent.sport } }],
        blockedUsers: { none: { blockedUserId: intent.userId } },
        blockedBy: { none: { userId: intent.userId } },
      },
    },
    select: { id: true },
  });
  if (!follower) {
    throw new ApiError(403, 'playIntent.sharedAccessDenied', true, {
      code: 'playIntent.sharedAccessDenied',
    });
  }

  return intent;
}

function sameValues(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

export class PlayIntentShareService {
  static async getSharedIntent(intentId: string, viewerId: string) {
    const intent = await loadAccessibleSource(intentId, viewerId);
    const clubs = intent.clubIds.length
      ? await prisma.club.findMany({
          where: { id: { in: intent.clubIds }, isActive: true },
          select: { id: true, name: true },
        })
      : [];

    return {
      id: intent.id,
      creator: intent.user,
      city: intent.city,
      sport: intent.sport,
      dateKeys: intent.dateKeys,
      timeOfDay: intent.timeOfDay,
      startTime: intent.startTime,
      endTime: intent.endTime,
      clubs,
      minLevel: intent.minLevel,
      maxLevel: intent.maxLevel,
      genderTeams: intent.genderTeams,
      expiresAt: intent.expiresAt,
    };
  }

  static async joinSharedIntent(intentId: string, viewerId: string) {
    const source = await loadAccessibleSource(intentId, viewerId);
    const dateKeys = PlayIntentService.resolveDateKeys({
      timezone: source.city.timezone,
      dateKeys: source.dateKeys,
    });
    const existing = await prisma.playIntent.findFirst({
      where: {
        userId: viewerId,
        cityId: source.cityId,
        sport: source.sport,
        entityType: EntityType.GAME,
        status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        expiresAt: { gt: new Date() },
        gameParticipants: { none: {} },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (
      existing &&
      sameValues(existing.dateKeys, dateKeys) &&
      existing.timeOfDay === source.timeOfDay &&
      existing.startTime === source.startTime &&
      existing.endTime === source.endTime &&
      sameValues(existing.clubIds, source.clubIds) &&
      existing.minLevel === source.minLevel &&
      existing.maxLevel === source.maxLevel &&
      existing.genderTeams === source.genderTeams
    ) {
      return existing;
    }

    return PlayIntentService.createOrReplace(
      viewerId,
      {
        cityId: source.cityId,
        sport: source.sport,
        dateKeys,
        timeOfDay: source.timeOfDay,
        startTime: source.startTime,
        endTime: source.endTime,
        clubIds: source.clubIds,
        minLevel: source.minLevel,
        maxLevel: source.maxLevel,
        genderTeams: source.genderTeams,
        entityType: EntityType.GAME,
      },
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "PlayIntent" WHERE id = ${intentId} FOR UPDATE
        `;
        await tx.$queryRaw`
          SELECT id FROM "UserFavoriteUser"
          WHERE "userId" = ${viewerId}
            AND "favoriteUserId" = ${source.userId}
          FOR UPDATE
        `;
        await loadAccessibleSource(intentId, viewerId, tx);
      },
    );
  }
}
