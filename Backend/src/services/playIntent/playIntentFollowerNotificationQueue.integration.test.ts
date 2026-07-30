import assert from 'node:assert/strict';
import {
  EntityType,
  NotificationChannelType,
  PlayIntentStatus,
  PushPlatform,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { NotificationType } from '../../types/notifications.types';
import notificationService from '../notification.service';
import { PlayIntentFollowerNotificationQueueService } from './playIntentFollowerNotificationQueue.service';

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: {
      name: `Follower queue ${suffix}`,
      country: 'Test',
      timezone: 'UTC',
    },
  });
  const creator = await prisma.user.create({
    data: {
      phone: `qa-follower-queue-creator-${suffix}`,
      firstName: 'Creator',
      currentCityId: city.id,
      sportsEnabled: [Sport.PADEL],
    },
  });
  const createFollower = (
    label: string,
    socialEnabled: boolean,
    withPush: boolean,
  ) =>
    prisma.user.create({
      data: {
        phone: `qa-follower-queue-${label}-${suffix}`,
        firstName: label,
        currentCityId: city.id,
        sportsEnabled: [Sport.PADEL],
        favoriteUsers: { create: { favoriteUserId: creator.id } },
        ...(withPush
          ? {
              pushTokens: {
                create: {
                  token: `qa-follower-queue-token-${label}-${suffix}`,
                  platform: PushPlatform.IOS,
                },
              },
              notificationPreferences: {
                create: {
                  channelType: NotificationChannelType.PUSH,
                  sendPlayIntentSocialNotifications: socialEnabled,
                },
              },
            }
          : {}),
      },
    });
  const [enabledFollower, mutedFollower, noChannelFollower] = await Promise.all([
    createFollower('enabled', true, true),
    createFollower('muted', false, true),
    createFollower('no-channel', true, false),
  ]);
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const createIntent = (status: PlayIntentStatus) =>
    prisma.playIntent.create({
      data: {
        userId: creator.id,
        cityId: city.id,
        sport: Sport.PADEL,
        entityType: EntityType.GAME,
        dateKeys: [start.toISOString().slice(0, 10)],
        clubIds: [],
        status,
        expiresAt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      },
    });
  const firstIntent = await createIntent(PlayIntentStatus.MATCHED);
  await prisma.playIntentFollowerNotificationJob.create({
    data: {
      intentId: firstIntent.id,
      userId: creator.id,
      cityId: city.id,
    },
  });

  const originalSend = notificationService.sendNotification;
  let providerCalls = 0;
  notificationService.sendNotification = async () => {
    providerCalls += 1;
    return { push: true, telegram: false };
  };

  try {
    await PlayIntentFollowerNotificationQueueService.drain();

    const firstJob =
      await prisma.playIntentFollowerNotificationJob.findUniqueOrThrow({
        where: { intentId: firstIntent.id },
      });
    assert.equal(firstJob.status, 'done');
    assert.ok(firstJob.deliveredAt);
    assert.equal(providerCalls, 1);
    assert.equal(
      await prisma.playIntentNotificationDelivery.count({
        where: {
          sourceId: firstIntent.id,
          notificationType: NotificationType.FOLLOWED_USER_PLAY_INTENT,
          userId: enabledFollower.id,
          status: 'done',
        },
      }),
      1,
    );
    assert.equal(
      await prisma.playIntentNotificationDelivery.count({
        where: {
          sourceId: firstIntent.id,
          userId: { in: [mutedFollower.id, noChannelFollower.id] },
        },
      }),
      0,
    );

    await prisma.playIntent.update({
      where: { id: firstIntent.id },
      data: { status: PlayIntentStatus.CANCELLED },
    });
    const secondIntent = await createIntent(PlayIntentStatus.OPEN);
    await prisma.playIntentFollowerNotificationJob.create({
      data: {
        intentId: secondIntent.id,
        userId: creator.id,
        cityId: city.id,
      },
    });
    await PlayIntentFollowerNotificationQueueService.drain();
    const cooldownJob =
      await prisma.playIntentFollowerNotificationJob.findUniqueOrThrow({
        where: { intentId: secondIntent.id },
      });
    assert.equal(cooldownJob.status, 'done');
    assert.equal(cooldownJob.deliveredAt, null);
    assert.equal(providerCalls, 1);
    assert.equal(
      await prisma.playIntentNotificationDelivery.count({
        where: { sourceId: secondIntent.id },
      }),
      0,
    );
  } finally {
    notificationService.sendNotification = originalSend;
    await prisma.playIntent.deleteMany({ where: { cityId: city.id } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            creator.id,
            enabledFollower.id,
            mutedFollower.id,
            noChannelFollower.id,
          ],
        },
      },
    });
    await prisma.city.delete({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})();
