import assert from 'node:assert/strict';
import {
  EntityType,
  GenderTeam,
  MatchProposalMemberResponse,
  MatchProposalStatus,
  NotificationChannelType,
  PlayIntentJobStatus,
  PlayIntentStatus,
  PushPlatform,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import notificationService from '../notification.service';
import { MatchProposalService } from './matchProposal.service';
import { PlayIntentMatchQueueService } from './playIntentMatchQueue.service';
import { PlayIntentNotificationDeliveryQueueService } from './playIntentNotificationDeliveryQueue.service';

void (async () => {
  const originalSend = notificationService.sendNotification;
  notificationService.sendNotification = async () => ({
    push: true,
    telegram: false,
  });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: {
      name: `Play intent match ${suffix}`,
      country: 'Test',
      timezone: 'UTC',
    },
  });
  const users = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      prisma.user.create({
        data: {
          phone: `qa-play-intent-match-${index}-${suffix}`,
          firstName: `Player ${index + 1}`,
          currentCityId: city.id,
          sportsEnabled: [Sport.PADEL],
          sportProfiles: {
            create: {
              sport: Sport.PADEL,
              level: 3,
            },
          },
          pushTokens: {
            create: {
              token: `qa-play-intent-match-token-${index}-${suffix}`,
              platform: PushPlatform.IOS,
            },
          },
          notificationPreferences: {
            create: {
              channelType: NotificationChannelType.PUSH,
              sendPlayIntentNotifications: true,
            },
          },
        },
      }),
    ),
  );
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dateKey = start.toISOString().slice(0, 10);
  const intents = await Promise.all(
    users.map((user) =>
      prisma.playIntent.create({
        data: {
          userId: user.id,
          cityId: city.id,
          sport: Sport.PADEL,
          entityType: EntityType.GAME,
          dateKeys: [dateKey],
          clubIds: [],
          minLevel: 2.5,
          maxLevel: 3.5,
          genderTeams: GenderTeam.ANY,
          status: PlayIntentStatus.OPEN,
          expiresAt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
        },
      }),
    ),
  );

  try {
    await PlayIntentMatchQueueService.enqueueIntentCreated(
      prisma,
      intents.at(-1)!.id,
    );
    await PlayIntentMatchQueueService.drain();

    const matchJob = await prisma.playIntentMatchJob.findFirstOrThrow({
      where: {
        kind: 'INTENT_CREATED',
        sourceId: intents.at(-1)!.id,
      },
    });
    assert.equal(matchJob.status, PlayIntentJobStatus.done);

    const proposals = await prisma.matchProposal.findMany({
      where: {
        cityId: city.id,
        sport: Sport.PADEL,
      },
      include: { members: true },
    });
    assert.equal(
      proposals.length,
      1,
      'creating the fourth compatible intent should form one proposal',
    );
    assert.equal(proposals[0].members.length, 4);
    assert.deepEqual(
      new Set(proposals[0].members.map((member) => member.userId)),
      new Set(users.map((user) => user.id)),
    );
    const deliveries = await prisma.playIntentNotificationDelivery.findMany({
      where: {
        notificationType: 'PLAY_INTENT_MATCH',
        sourceId: proposals[0].id,
      },
    });
    assert.equal(deliveries.length, 4);
    assert.deepEqual(
      new Set(deliveries.map((delivery) => delivery.userId)),
      new Set(users.map((user) => user.id)),
    );

    // Unique (kind, sourceId) prevents a second job; replay the existing one.
    await prisma.playIntentMatchJob.update({
      where: { id: matchJob.id },
      data: {
        status: PlayIntentJobStatus.pending,
        attempts: 0,
        runAfter: new Date(),
      },
    });
    await PlayIntentMatchQueueService.drain();
    assert.equal(
      await prisma.playIntentNotificationDelivery.count({
        where: {
          notificationType: 'PLAY_INTENT_MATCH',
          sourceId: proposals[0].id,
        },
      }),
      4,
      'reconciling the same proposal must not duplicate recipient deliveries',
    );

    const departedUserId = users[0].id;
    await prisma.matchProposalMember.updateMany({
      where: { proposalId: proposals[0].id, userId: departedUserId },
      data: { response: MatchProposalMemberResponse.DECLINED },
    });
    await prisma.playIntentNotificationDelivery.updateMany({
      where: {
        notificationType: 'PLAY_INTENT_MATCH',
        sourceId: proposals[0].id,
      },
      data: { status: PlayIntentJobStatus.skipped },
    });
    await prisma.playIntentNotificationDelivery.updateMany({
      where: {
        notificationType: 'PLAY_INTENT_MATCH',
        sourceId: proposals[0].id,
        userId: departedUserId,
      },
      data: {
        status: PlayIntentJobStatus.pending,
        attempts: 0,
        runAfter: new Date(),
      },
    });
    await PlayIntentNotificationDeliveryQueueService.drain();
    const departedDelivery =
      await prisma.playIntentNotificationDelivery.findFirstOrThrow({
        where: {
          notificationType: 'PLAY_INTENT_MATCH',
          sourceId: proposals[0].id,
          userId: departedUserId,
        },
      });
    assert.equal(departedDelivery.status, PlayIntentJobStatus.skipped);

    await prisma.matchProposal.update({
      where: { id: proposals[0].id },
      data: { status: MatchProposalStatus.EXPIRED },
    });
    await assert.rejects(
      () => MatchProposalService.getById(proposals[0].id, users[0].id),
      (error: unknown) =>
        error instanceof Error &&
        'data' in error &&
        (error as { data?: { code?: string } }).data?.code ===
          'playIntent.proposalUnavailable',
    );
  } finally {
    notificationService.sendNotification = originalSend;
    await prisma.playIntentNotificationDelivery.deleteMany({
      where: { userId: { in: users.map((user) => user.id) } },
    });
    await prisma.playIntentMatchJob.deleteMany({
      where: { sourceId: { in: intents.map((intent) => intent.id) } },
    });
    await prisma.matchProposal.deleteMany({ where: { cityId: city.id } });
    await prisma.playIntent.deleteMany({ where: { cityId: city.id } });
    await prisma.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
    });
    await prisma.city.delete({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})();
