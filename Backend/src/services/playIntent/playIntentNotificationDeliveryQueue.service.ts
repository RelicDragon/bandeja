import {
  EntityType,
  MatchProposalMemberResponse,
  NotificationChannelType,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentJobStatus,
  PlayIntentStatus,
  Prisma,
  type PlayIntentNotificationDelivery,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import {
  NotificationType,
  type NotificationPayload,
} from '../../types/notifications.types';
import notificationService from '../notification.service';
import {
  NOTIFICATION_TYPE_TO_PREF,
  NotificationPreferenceService,
} from '../notificationPreference.service';
import { followerAudienceWhere } from './playIntentFollowerAudience';
import {
  gameStartIsFuture,
  intentWindowIsReachable,
  proposalWindowSource,
} from './playIntentFreshness';
import {
  intentMatchesGame,
  timeStringToMinutes,
  type IntentCriteria,
} from './playIntentCriteria';
import { reportPlayIntentQueueError } from './playIntentQueueFailure';

const POLL_INTERVAL_MS = 5_000;
const STALE_RUNNING_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const MAX_RETRY_DELAY_MS = 10 * 60 * 1000;
/** Telegram has no collapse key; crash mid-send must not auto-resend. */
const TELEGRAM_DISPATCHING_MARKER = 'dispatching:telegram';

let workerTimer: ReturnType<typeof setInterval> | null = null;
let draining = false;

type DeliveryDb = Pick<
  Prisma.TransactionClient,
  'playIntentNotificationDelivery'
>;

export type PlayIntentDeliveryInput = {
  eventKey: string;
  sourceId: string;
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  channels: NotificationChannelType[];
};

function isNotificationType(value: string): value is NotificationType {
  return Object.values(NotificationType).includes(value as NotificationType);
}

function parsePayload(value: Prisma.JsonValue): NotificationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid play-intent notification payload');
  }
  const payload = value as unknown as NotificationPayload;
  if (
    !isNotificationType(payload.type) ||
    typeof payload.title !== 'string' ||
    typeof payload.body !== 'string'
  ) {
    throw new Error('Invalid play-intent notification payload');
  }
  return payload;
}

async function deliveryIsStillRelevant(
  job: PlayIntentNotificationDelivery,
): Promise<boolean> {
  const now = new Date();
  if (job.notificationType === NotificationType.FOLLOWED_USER_PLAY_INTENT) {
    const intent = await prisma.playIntent.findUnique({
      where: { id: job.sourceId },
      include: {
        city: { select: { timezone: true } },
        gameParticipants: { select: { id: true }, take: 1 },
      },
    });
    if (
      !intent ||
      intent.entityType !== EntityType.GAME ||
      (intent.status !== PlayIntentStatus.OPEN &&
        intent.status !== PlayIntentStatus.MATCHED) ||
      intent.gameParticipants.length > 0 ||
      intent.expiresAt <= now ||
      !intentWindowIsReachable(intent, intent.city.timezone, now)
    ) {
      return false;
    }
    const stillFollower = await prisma.userFavoriteUser.findFirst({
      where: {
        userId: job.userId,
        ...followerAudienceWhere(intent.userId, intent.cityId, intent.sport),
      },
      select: { id: true },
    });
    return Boolean(stillFollower);
  }
  if (job.notificationType === NotificationType.PLAY_INTENT_MATCH) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: job.sourceId },
      include: {
        city: { select: { timezone: true } },
        members: {
          where: { userId: job.userId },
          select: { response: true },
          take: 1,
        },
      },
    });
    const membership = proposal?.members[0];
    return Boolean(
      proposal &&
        membership &&
        membership.response !== MatchProposalMemberResponse.DECLINED &&
        (proposal.status === 'PENDING' || proposal.status === 'ACCEPTED') &&
        !proposal.gameId &&
        proposal.expiresAt > now &&
        intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
          now,
        ),
    );
  }

  const game = await prisma.game.findUnique({
    where: { id: job.sourceId },
    select: {
      status: true,
      startTime: true,
      maxParticipants: true,
      isPublic: true,
      cityId: true,
      sport: true,
      entityType: true,
      clubId: true,
      minLevel: true,
      maxLevel: true,
      genderTeams: true,
      city: { select: { timezone: true } },
      participants: {
        select: { userId: true, role: true, status: true },
      },
    },
  });
  if (
    !game ||
    !game.isPublic ||
    (game.status !== 'ANNOUNCED' && game.status !== 'STARTED') ||
    !gameStartIsFuture(game.startTime) ||
    game.participants.filter(
      (participant) => participant.status === ParticipantStatus.PLAYING,
    ).length >= game.maxParticipants
  ) {
    return false;
  }
  if (job.notificationType === NotificationType.INTENT_PLAYERS_FOR_GAME) {
    // Continue below: owner nudges are relevant only while a matching seeker remains.
  } else if (job.notificationType !== NotificationType.GAME_MATCHES_INTENT) {
    return false;
  }
  if (
    job.notificationType === NotificationType.GAME_MATCHES_INTENT &&
    game.participants.some(
      (participant) =>
        participant.userId === job.userId &&
        (participant.status === ParticipantStatus.PLAYING ||
          participant.status === ParticipantStatus.INVITED),
    )
  ) {
    return false;
  }
  if (job.notificationType === NotificationType.GAME_MATCHES_INTENT) {
    const ownerIds = game.participants
      .filter(
        (participant) =>
          participant.role === ParticipantRole.OWNER &&
          participant.status === ParticipantStatus.PLAYING,
      )
      .map((participant) => participant.userId);
    if (ownerIds.length > 0) {
      const blockedOwner = await prisma.blockedUser.findFirst({
        where: {
          OR: [
            { userId: job.userId, blockedUserId: { in: ownerIds } },
            { userId: { in: ownerIds }, blockedUserId: job.userId },
          ],
        },
        select: { userId: true },
      });
      if (blockedOwner) return false;
    }
  }

  const timezone = game.city.timezone || 'UTC';
  const dateKey = formatInTimeZone(game.startTime, timezone, 'yyyy-MM-dd');
  if (job.notificationType === NotificationType.GAME_MATCHES_INTENT) {
    const { PlayIntentMatchService } = await import('./playIntentMatch.service');
    const busy = await PlayIntentMatchService.usersBusyPlaying(
      [job.userId],
      [dateKey],
      game.cityId,
    );
    if (busy.has(job.userId)) return false;
  }
  const startTimeMinutes = timeStringToMinutes(
    formatInTimeZone(game.startTime, timezone, 'HH:mm'),
  );
  const intentEntityType =
    game.entityType === EntityType.BAR ? EntityType.BAR : EntityType.GAME;
  const intents = await prisma.playIntent.findMany({
    where: {
      userId:
        job.notificationType === NotificationType.GAME_MATCHES_INTENT
          ? job.userId
          : { not: job.userId },
      cityId: game.cityId,
      sport: game.sport,
      entityType: intentEntityType,
      status: 'OPEN',
      expiresAt: { gt: now },
      gameParticipants: { none: {} },
    },
    include: {
      user: {
        select: {
          gender: true,
          sportProfiles: { select: { sport: true, level: true } },
        },
      },
    },
  });
  const blockedIntentUserIds = new Set<string>();
  if (
    job.notificationType === NotificationType.INTENT_PLAYERS_FOR_GAME &&
    intents.length > 0
  ) {
    const intentUserIds = intents.map((intent) => intent.userId);
    const blockedRows = await prisma.blockedUser.findMany({
      where: {
        OR: [
          { userId: job.userId, blockedUserId: { in: intentUserIds } },
          { userId: { in: intentUserIds }, blockedUserId: job.userId },
        ],
      },
      select: { userId: true, blockedUserId: true },
    });
    for (const row of blockedRows) {
      blockedIntentUserIds.add(
        row.userId === job.userId ? row.blockedUserId : row.userId,
      );
    }
  }
  return intents.some((intent) => {
    if (blockedIntentUserIds.has(intent.userId)) return false;
    if (!intentWindowIsReachable(intent, timezone, now)) return false;
    const profile = intent.user.sportProfiles.find(
      (candidate) => candidate.sport === intent.sport,
    );
    const criteria: IntentCriteria = {
      dateKeys: intent.dateKeys,
      clubIds: intent.clubIds,
      minLevel: intent.minLevel,
      maxLevel: intent.maxLevel,
      timeOfDay: intent.timeOfDay,
      startTime: intent.startTime,
      endTime: intent.endTime,
      genderTeams: intent.genderTeams,
      userLevel: profile?.level ?? null,
      userGender: intent.user.gender,
    };
    return intentMatchesGame(
      criteria,
      {
        entityType: game.entityType,
        dateKey,
        clubId: game.clubId,
        startTime: game.startTime,
        startTimeMinutes,
        minLevel: game.minLevel,
        maxLevel: game.maxLevel,
        genderTeams: game.genderTeams,
      },
      now,
    );
  });
}

export class PlayIntentNotificationDeliveryQueueService {
  static async enabledChannels(
    userId: string,
    type: NotificationType,
  ): Promise<NotificationChannelType[]> {
    const preferences =
      await NotificationPreferenceService.getEffectivePreferencesForNotification(
        userId,
      );
    const preferenceKey = NOTIFICATION_TYPE_TO_PREF[type];
    return [
      ...(preferences.push?.[preferenceKey]
        ? [NotificationChannelType.PUSH]
        : []),
      ...(preferences.telegram?.[preferenceKey]
        ? [NotificationChannelType.TELEGRAM]
        : []),
    ];
  }

  static async enqueue(
    input: PlayIntentDeliveryInput,
    db: DeliveryDb = prisma,
  ): Promise<number> {
    if (input.channels.length === 0) return 0;
    const payload: NotificationPayload = {
      ...input.payload,
      data: {
        ...input.payload.data,
        deliveryKey: input.eventKey,
      },
    };
    const result = await db.playIntentNotificationDelivery.createMany({
      data: input.channels.map((channelType) => ({
        eventKey: input.eventKey,
        notificationType: input.type,
        sourceId: input.sourceId,
        userId: input.userId,
        channelType,
        payload: payload as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  static startWorker(): void {
    if (workerTimer) return;
    workerTimer = setInterval(() => void this.drain(), POLL_INTERVAL_MS);
    void this.drain();
  }

  static stopWorker(): void {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  }

  private static async recoverStaleJobs(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
    await prisma.playIntentNotificationDelivery.updateMany({
      where: {
        status: PlayIntentJobStatus.running,
        updatedAt: { lt: staleBefore },
        channelType: NotificationChannelType.TELEGRAM,
        lastError: TELEGRAM_DISPATCHING_MARKER,
      },
      data: {
        status: PlayIntentJobStatus.failed,
        lastError: 'stale_telegram_dispatch_ambiguous',
      },
    });
    await prisma.playIntentNotificationDelivery.updateMany({
      where: {
        status: PlayIntentJobStatus.running,
        updatedAt: { lt: staleBefore },
        OR: [
          { channelType: NotificationChannelType.PUSH },
          {
            channelType: NotificationChannelType.TELEGRAM,
            OR: [
              { lastError: null },
              { lastError: { not: TELEGRAM_DISPATCHING_MARKER } },
            ],
          },
        ],
      },
      data: {
        status: PlayIntentJobStatus.pending,
        runAfter: new Date(),
        lastError: 'recovered_stale_running',
      },
    });
  }

  private static async claimNext(): Promise<PlayIntentNotificationDelivery | null> {
    const candidate = await prisma.playIntentNotificationDelivery.findFirst({
      where: {
        status: PlayIntentJobStatus.pending,
        runAfter: { lte: new Date() },
      },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return null;

    const claimed = await prisma.playIntentNotificationDelivery.updateMany({
      where: {
        id: candidate.id,
        status: PlayIntentJobStatus.pending,
      },
      data: {
        status: PlayIntentJobStatus.running,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    return prisma.playIntentNotificationDelivery.findUnique({
      where: { id: candidate.id },
    });
  }

  private static async process(job: PlayIntentNotificationDelivery): Promise<void> {
    try {
      if (!isNotificationType(job.notificationType)) {
        throw new Error(`Unknown notification type: ${job.notificationType}`);
      }
      const preferenceKey = NOTIFICATION_TYPE_TO_PREF[job.notificationType];
      const allowed = await NotificationPreferenceService.doesUserAllow(
        job.userId,
        job.channelType,
        preferenceKey,
      );
      if (!allowed) {
        await prisma.playIntentNotificationDelivery.update({
          where: { id: job.id },
          data: {
            status: PlayIntentJobStatus.skipped,
            lastError: null,
          },
        });
        return;
      }
      if (!(await deliveryIsStillRelevant(job))) {
        await prisma.playIntentNotificationDelivery.update({
          where: { id: job.id },
          data: {
            status: PlayIntentJobStatus.skipped,
            lastError: null,
          },
        });
        return;
      }

      if (job.channelType === NotificationChannelType.TELEGRAM) {
        await prisma.playIntentNotificationDelivery.update({
          where: { id: job.id },
          data: { lastError: TELEGRAM_DISPATCHING_MARKER },
        });
      }

      const delivery = await notificationService.sendNotification({
        userId: job.userId,
        type: job.notificationType,
        payload: parsePayload(job.payload),
        channels: [job.channelType],
      });
      const delivered =
        job.channelType === NotificationChannelType.PUSH
          ? delivery.push
          : delivery.telegram;
      if (!delivered) {
        throw new Error(`${job.channelType.toLowerCase()} provider did not accept delivery`);
      }

      await prisma.playIntentNotificationDelivery.update({
        where: { id: job.id },
        data: {
          status: PlayIntentJobStatus.done,
          deliveredAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = job.attempts >= MAX_ATTEMPTS;
      const retryDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        2 ** job.attempts * 1_000,
      );
      await prisma.playIntentNotificationDelivery.update({
        where: { id: job.id },
        data: {
          status: failed
            ? PlayIntentJobStatus.failed
            : PlayIntentJobStatus.pending,
          runAfter: new Date(Date.now() + retryDelay),
          lastError: message.slice(0, 2_000),
        },
      });
      if (failed) {
        reportPlayIntentQueueError(
          `play-intent-delivery:${job.channelType.toLowerCase()}`,
          `job ${job.id} exhausted retries`,
          `${job.eventKey}: ${message}`,
        );
      }
    }
  }

  static async drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      await this.recoverStaleJobs();
      while (true) {
        const job = await this.claimNext();
        if (!job) break;
        await this.process(job);
      }
    } catch (error) {
      reportPlayIntentQueueError(
        'play-intent-delivery',
        'drain failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      draining = false;
    }
  }
}
