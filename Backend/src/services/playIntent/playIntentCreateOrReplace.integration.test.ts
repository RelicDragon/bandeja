import assert from 'node:assert/strict';
import {
  EntityType,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { PlayIntentFollowerNotificationQueueService } from './playIntentFollowerNotificationQueue.service';
import { PlayIntentMatchQueueService } from './playIntentMatchQueue.service';
import { PlayIntentService } from './playIntent.service';

void (async () => {
  const originalSocketService = (global as { socketService?: unknown })
    .socketService;
  const originalMatchDrain = PlayIntentMatchQueueService.drain;
  const originalFollowerDrain =
    PlayIntentFollowerNotificationQueueService.drain;
  (global as { socketService?: unknown }).socketService = new Proxy(
    {},
    {
      get: () => () => undefined,
    },
  );
  PlayIntentMatchQueueService.drain = async () => undefined;
  PlayIntentFollowerNotificationQueueService.drain = async () => undefined;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: {
      name: `CreateOrReplace ${suffix}`,
      country: 'Test',
      timezone: 'UTC',
    },
  });
  const [openUser, reservedUser] = await Promise.all([
    prisma.user.create({
      data: {
        phone: `qa-play-intent-create-${suffix}`,
        firstName: 'Create',
        currentCityId: city.id,
        sportsEnabled: [Sport.PADEL],
        sportProfiles: {
          create: { sport: Sport.PADEL, level: 3 },
        },
      },
    }),
    prisma.user.create({
      data: {
        phone: `qa-play-intent-reserved-${suffix}`,
        firstName: 'Reserved',
        currentCityId: city.id,
        sportsEnabled: [Sport.PADEL],
        sportProfiles: {
          create: { sport: Sport.PADEL, level: 3 },
        },
      },
    }),
  ]);
  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  startTime.setUTCHours(18, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
  const dateKey = startTime.toISOString().slice(0, 10);
  const matchedIntent = await prisma.playIntent.create({
    data: {
      userId: reservedUser.id,
      cityId: city.id,
      sport: Sport.PADEL,
      entityType: EntityType.GAME,
      dateKeys: [dateKey],
      clubIds: [],
      status: PlayIntentStatus.MATCHED,
      expiresAt: new Date(endTime.getTime() + 60 * 60 * 1000),
    },
  });
  const game = await prisma.game.create({
    data: {
      entityType: EntityType.GAME,
      sport: Sport.PADEL,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime,
      endTime,
      timeIsSet: true,
      participants: {
        create: {
          userId: reservedUser.id,
          role: ParticipantRole.PARTICIPANT,
          status: ParticipantStatus.INVITED,
          playIntentId: matchedIntent.id,
        },
      },
    },
  });

  try {
    const created = await PlayIntentService.createOrReplace(openUser.id, {
      cityId: city.id,
      sport: Sport.PADEL,
      dateKeys: [dateKey],
      timeOfDay: 'EVENING',
    });
    assert.equal(created.status, PlayIntentStatus.OPEN);
    assert.equal(created.userId, openUser.id);
    assert.deepEqual(created.dateKeys, [dateKey]);

    let pendingError: unknown;
    try {
      await PlayIntentService.createOrReplace(reservedUser.id, {
        cityId: city.id,
        sport: Sport.PADEL,
        dateKeys: [dateKey],
        timeOfDay: 'EVENING',
      });
    } catch (error) {
      pendingError = error;
    }
    assert.ok(pendingError instanceof ApiError);
    assert.equal(pendingError.statusCode, 409);
    assert.equal(pendingError.data?.code, 'playIntent.pendingGameInvite');
    assert.equal(
      await prisma.playIntent.count({
        where: {
          userId: reservedUser.id,
          status: PlayIntentStatus.OPEN,
        },
      }),
      0,
    );
  } finally {
    PlayIntentMatchQueueService.drain = originalMatchDrain;
    PlayIntentFollowerNotificationQueueService.drain = originalFollowerDrain;
    (global as { socketService?: unknown }).socketService =
      originalSocketService;
    const intentIds = (
      await prisma.playIntent.findMany({
        where: { userId: { in: [openUser.id, reservedUser.id] } },
        select: { id: true },
      })
    ).map((intent) => intent.id);
    await prisma.gameParticipant.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } }).catch(() => undefined);
    await prisma.playIntentFollowerNotificationJob
      .deleteMany({
        where: { userId: { in: [openUser.id, reservedUser.id] } },
      })
      .catch(() => undefined);
    if (intentIds.length > 0) {
      await prisma.playIntentMatchJob
        .deleteMany({ where: { sourceId: { in: intentIds } } })
        .catch(() => undefined);
    }
    await prisma.playIntent
      .deleteMany({
        where: { userId: { in: [openUser.id, reservedUser.id] } },
      })
      .catch(() => undefined);
    await prisma.userSportProfile
      .deleteMany({
        where: { userId: { in: [openUser.id, reservedUser.id] } },
      })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({
        where: { id: { in: [openUser.id, reservedUser.id] } },
      })
      .catch(() => undefined);
    await prisma.city.delete({ where: { id: city.id } }).catch(() => undefined);
  }

  console.log('playIntentCreateOrReplace.integration.test.ts: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
