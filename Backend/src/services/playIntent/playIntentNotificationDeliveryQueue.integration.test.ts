import assert from 'node:assert/strict';
import {
  EntityType,
  NotificationChannelType,
  PlayIntentJobStatus,
  PlayIntentStatus,
  PushPlatform,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { NotificationType } from '../../types/notifications.types';
import notificationService from '../notification.service';
import { PlayIntentNotificationDeliveryQueueService } from './playIntentNotificationDeliveryQueue.service';

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: {
      name: `Play intent delivery ${suffix}`,
      country: 'Test',
      timezone: 'UTC',
    },
  });
  const creator = await prisma.user.create({
    data: {
      phone: `qa-play-intent-delivery-creator-${suffix}`,
      firstName: 'Creator',
      currentCityId: city.id,
      sportsEnabled: [Sport.PADEL],
    },
  });
  const follower = await prisma.user.create({
    data: {
      phone: `qa-play-intent-delivery-follower-${suffix}`,
      firstName: 'Follower',
      currentCityId: city.id,
      sportsEnabled: [Sport.PADEL],
      pushTokens: {
        create: {
          token: `qa-token-${suffix}`,
          platform: PushPlatform.IOS,
        },
      },
      notificationPreferences: {
        create: {
          channelType: NotificationChannelType.PUSH,
          sendPlayIntentNotifications: true,
          sendPlayIntentSocialNotifications: true,
        },
      },
      favoriteUsers: {
        create: { favoriteUserId: creator.id },
      },
    },
  });
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const intent = await prisma.playIntent.create({
    data: {
      userId: creator.id,
      cityId: city.id,
      sport: Sport.PADEL,
      entityType: EntityType.GAME,
      dateKeys: [start.toISOString().slice(0, 10)],
      clubIds: [],
      status: PlayIntentStatus.OPEN,
      expiresAt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    },
  });
  const originalSend = notificationService.sendNotification;
  let providerAccepts = false;
  let providerCalls = 0;
  notificationService.sendNotification = async () => {
    providerCalls += 1;
    return { push: providerAccepts, telegram: false };
  };

  try {
    await prisma.notificationPreference.update({
      where: {
        userId_channelType: {
          userId: follower.id,
          channelType: NotificationChannelType.PUSH,
        },
      },
      data: { sendPlayIntentSocialNotifications: false },
    });
    assert.deepEqual(
      await PlayIntentNotificationDeliveryQueueService.enabledChannels(
        follower.id,
        NotificationType.PLAY_INTENT_MATCH,
      ),
      [NotificationChannelType.PUSH],
    );
    assert.deepEqual(
      await PlayIntentNotificationDeliveryQueueService.enabledChannels(
        follower.id,
        NotificationType.FOLLOWED_USER_PLAY_INTENT,
      ),
      [],
    );
    await prisma.notificationPreference.update({
      where: {
        userId_channelType: {
          userId: follower.id,
          channelType: NotificationChannelType.PUSH,
        },
      },
      data: { sendPlayIntentSocialNotifications: true },
    });

    await PlayIntentNotificationDeliveryQueueService.enqueue({
      eventKey: `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}`,
      sourceId: intent.id,
      userId: follower.id,
      type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
      payload: {
        type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
        title: 'A friend wants to play',
        body: 'Open the request',
        data: { playIntentId: intent.id },
      },
      channels: [NotificationChannelType.PUSH],
    });
    await PlayIntentNotificationDeliveryQueueService.drain();

    const failedAttempt =
      await prisma.playIntentNotificationDelivery.findFirstOrThrow({
        where: { userId: follower.id },
      });
    assert.equal(failedAttempt.status, PlayIntentJobStatus.pending);
    assert.equal(failedAttempt.attempts, 1);
    assert.match(failedAttempt.lastError ?? '', /provider did not accept/);
    assert.equal(providerCalls, 1);
    assert.equal(
      (failedAttempt.payload as { data?: { deliveryKey?: string } }).data
        ?.deliveryKey,
      failedAttempt.eventKey,
    );

    providerAccepts = true;
    await prisma.playIntentNotificationDelivery.update({
      where: { id: failedAttempt.id },
      data: { runAfter: new Date() },
    });
    await PlayIntentNotificationDeliveryQueueService.drain();

    const delivered =
      await prisma.playIntentNotificationDelivery.findUniqueOrThrow({
        where: { id: failedAttempt.id },
      });
    assert.equal(delivered.status, PlayIntentJobStatus.done);
    assert.equal(delivered.attempts, 2);
    assert.ok(delivered.deliveredAt);
    assert.equal(providerCalls, 2);

    const duplicateCount =
      await PlayIntentNotificationDeliveryQueueService.enqueue({
        eventKey: failedAttempt.eventKey,
        sourceId: failedAttempt.sourceId,
        userId: follower.id,
        type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
        payload: failedAttempt.payload as never,
        channels: [NotificationChannelType.PUSH],
      });
    assert.equal(duplicateCount, 0);
    assert.equal(
      await prisma.playIntentNotificationDelivery.count({
        where: { userId: follower.id },
      }),
      1,
    );

    await prisma.playIntent.update({
      where: { id: intent.id },
      data: { status: PlayIntentStatus.MATCHED },
    });
    const matchedEventKey = `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}:matched`;
    await PlayIntentNotificationDeliveryQueueService.enqueue({
      eventKey: matchedEventKey,
      sourceId: intent.id,
      userId: follower.id,
      type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
      payload: {
        type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
        title: 'A friend wants to play',
        body: 'Open the request',
        data: { playIntentId: intent.id },
      },
      channels: [NotificationChannelType.PUSH],
    });
    await PlayIntentNotificationDeliveryQueueService.drain();
    const matchedDelivery =
      await prisma.playIntentNotificationDelivery.findFirstOrThrow({
        where: { userId: follower.id, eventKey: matchedEventKey },
      });
    assert.equal(matchedDelivery.status, PlayIntentJobStatus.done);
    assert.equal(providerCalls, 3);

    const staleEventKey = `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}:stale`;
    await PlayIntentNotificationDeliveryQueueService.enqueue({
      eventKey: staleEventKey,
      sourceId: intent.id,
      userId: follower.id,
      type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
      payload: {
        type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
        title: 'A friend wants to play',
        body: 'Open the request',
        data: { playIntentId: intent.id },
      },
      channels: [NotificationChannelType.PUSH],
    });
    await prisma.playIntentNotificationDelivery.updateMany({
      where: { userId: follower.id, eventKey: staleEventKey },
      data: {
        status: PlayIntentJobStatus.running,
        attempts: 1,
        updatedAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });
    await PlayIntentNotificationDeliveryQueueService.drain();
    const recoveredDelivery =
      await prisma.playIntentNotificationDelivery.findFirstOrThrow({
        where: { userId: follower.id, eventKey: staleEventKey },
      });
    assert.equal(recoveredDelivery.status, PlayIntentJobStatus.done);
    assert.equal(recoveredDelivery.attempts, 2);
    assert.equal(providerCalls, 4);

    const mutedEventKey = `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}:muted`;
    await PlayIntentNotificationDeliveryQueueService.enqueue({
      eventKey: mutedEventKey,
      sourceId: intent.id,
      userId: follower.id,
      type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
      payload: {
        type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
        title: 'A friend wants to play',
        body: 'Open the request',
        data: { playIntentId: intent.id },
      },
      channels: [NotificationChannelType.PUSH],
    });
    await prisma.notificationPreference.update({
      where: {
        userId_channelType: {
          userId: follower.id,
          channelType: NotificationChannelType.PUSH,
        },
      },
      data: { sendPlayIntentSocialNotifications: false },
    });
    await PlayIntentNotificationDeliveryQueueService.drain();
    const mutedDelivery =
      await prisma.playIntentNotificationDelivery.findFirstOrThrow({
        where: { userId: follower.id, eventKey: mutedEventKey },
      });
    assert.equal(mutedDelivery.status, PlayIntentJobStatus.skipped);
    assert.equal(providerCalls, 4);
    await prisma.notificationPreference.update({
      where: {
        userId_channelType: {
          userId: follower.id,
          channelType: NotificationChannelType.PUSH,
        },
      },
      data: { sendPlayIntentSocialNotifications: true },
    });

    // A permanent failure (e.g. user has no telegram id, bot not configured,
    // user blocked the bot) must be skipped after a single attempt — not retried
    // 12× and then surfaced as a noisy "exhausted retries" alert.
    const permanentEventKey = `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}:permanent`;
    let permanentProviderCalls = 0;
    notificationService.sendNotification = async () => {
      permanentProviderCalls += 1;
      return {
        push: false,
        telegram: false,
        permanentFailure: 'telegram-permanent-rejection',
      };
    };
    await PlayIntentNotificationDeliveryQueueService.enqueue({
      eventKey: permanentEventKey,
      sourceId: intent.id,
      userId: follower.id,
      type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
      payload: {
        type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
        title: 'A friend wants to play',
        body: 'Open the request',
        data: { playIntentId: intent.id },
      },
      channels: [NotificationChannelType.PUSH],
    });
    await PlayIntentNotificationDeliveryQueueService.drain();
    const permanentDelivery =
      await prisma.playIntentNotificationDelivery.findFirstOrThrow({
        where: { userId: follower.id, eventKey: permanentEventKey },
      });
    assert.equal(permanentDelivery.status, PlayIntentJobStatus.skipped);
    assert.equal(permanentDelivery.attempts, 1);
    assert.equal(permanentProviderCalls, 1);
    // A second drain must not reprocess a skipped job.
    await PlayIntentNotificationDeliveryQueueService.drain();
    const permanentDeliveryAfterRedrain =
      await prisma.playIntentNotificationDelivery.findFirstOrThrow({
        where: { userId: follower.id, eventKey: permanentEventKey },
      });
    assert.equal(permanentDeliveryAfterRedrain.status, PlayIntentJobStatus.skipped);
    assert.equal(permanentProviderCalls, 1);
    // Restore the original stub so the remaining blocks behave as before.
    providerCalls = 4;
    notificationService.sendNotification = async () => {
      providerCalls += 1;
      return { push: providerAccepts, telegram: false };
    };

    await prisma.userFavoriteUser.deleteMany({
      where: { userId: follower.id, favoriteUserId: creator.id },
    });
    await PlayIntentNotificationDeliveryQueueService.enqueue({
      eventKey: `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}:unfollowed`,
      sourceId: intent.id,
      userId: follower.id,
      type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
      payload: {
        type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
        title: 'A friend wants to play',
        body: 'Open the request',
        data: { playIntentId: intent.id },
      },
      channels: [NotificationChannelType.PUSH],
    });
    await PlayIntentNotificationDeliveryQueueService.drain();
    const skipped = await prisma.playIntentNotificationDelivery.findFirstOrThrow(
      {
        where: {
          userId: follower.id,
          eventKey: `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}:unfollowed`,
        },
      },
    );
    assert.equal(skipped.status, PlayIntentJobStatus.skipped);
    assert.equal(providerCalls, 4);
  } finally {
    notificationService.sendNotification = originalSend;
    await prisma.playIntentNotificationDelivery.deleteMany({
      where: { userId: follower.id },
    });
    await prisma.playIntent.deleteMany({ where: { cityId: city.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [creator.id, follower.id] } },
    });
    await prisma.city.delete({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})();
