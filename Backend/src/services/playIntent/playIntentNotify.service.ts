import prisma from '../../config/database';
import {
  EntityType,
  NotificationChannelType,
  PlayIntentStatus,
  Prisma,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import {
  NotificationType,
  type NotificationPayload,
} from '../../types/notifications.types';
import { t } from '../../utils/translations';
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
import {
  buildPlayIntentFollowerNotification,
  buildPlayIntentWhenLabel,
  interpolatePlayIntentCopy,
} from './playIntentFollowerNotification';
import { followerAudienceWhere } from './playIntentFollowerAudience';
import { formatSportLabel } from '../shared/notificationSport';
import { PlayIntentNotificationDeliveryQueueService } from './playIntentNotificationDeliveryQueue.service';
import {
  canSendGameMatchNotification,
  GAME_MATCH_NOTIFICATION_WINDOW_MS,
} from './playIntentNotificationBudget';

function toCriteria(intent: {
  dateKeys: string[];
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  timeOfDay: IntentCriteria['timeOfDay'];
  startTime: string | null;
  endTime: string | null;
  genderTeams: IntentCriteria['genderTeams'];
  sport: string;
  user: {
    gender: string | null;
    sportProfiles: { sport: string; level: number }[];
  };
}): IntentCriteria {
  const profile = intent.user.sportProfiles.find((p) => p.sport === intent.sport);
  return {
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
}

function gameScheduleLabel(startTime: Date, timezone: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(startTime);
  } catch {
    return formatInTimeZone(startTime, timezone, 'EEE, MMM d · HH:mm');
  }
}

async function enqueueForUser(input: {
  eventKey: string;
  sourceId: string;
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
}): Promise<number> {
  const channels =
    await PlayIntentNotificationDeliveryQueueService.enabledChannels(
      input.userId,
      input.type,
    );
  return PlayIntentNotificationDeliveryQueueService.enqueue({
    ...input,
    channels,
  });
}

async function enqueueGameMatchForUser(input: {
  eventKey: string;
  sourceId: string;
  userId: string;
  payload: NotificationPayload;
  now: Date;
}): Promise<number> {
  const channels =
    await PlayIntentNotificationDeliveryQueueService.enabledChannels(
      input.userId,
      NotificationType.GAME_MATCHES_INTENT,
    );
  if (channels.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`play-intent-game-match-notification:${input.userId}`}))`;
    const recent = await tx.playIntentNotificationDelivery.findMany({
      where: {
        userId: input.userId,
        notificationType: NotificationType.GAME_MATCHES_INTENT,
        createdAt: {
          gte: new Date(
            input.now.getTime() -
              GAME_MATCH_NOTIFICATION_WINDOW_MS,
          ),
        },
      },
      select: { eventKey: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !canSendGameMatchNotification(
        recent,
        input.eventKey,
        input.now,
      )
    ) {
      return 0;
    }
    return PlayIntentNotificationDeliveryQueueService.enqueue(
      {
        eventKey: input.eventKey,
        sourceId: input.sourceId,
        userId: input.userId,
        type: NotificationType.GAME_MATCHES_INTENT,
        payload: input.payload,
        channels,
      },
      tx,
    );
  });
}

export class PlayIntentNotifyService {
  static async notifyFollowers(intentId: string): Promise<number> {
    const intent = await prisma.playIntent.findUnique({
      where: { id: intentId },
      include: {
        city: { select: { name: true, timezone: true } },
        user: { select: { firstName: true } },
      },
    });
    if (
      !intent ||
      intent.entityType !== EntityType.GAME ||
      (intent.status !== PlayIntentStatus.OPEN &&
        intent.status !== PlayIntentStatus.MATCHED) ||
      !intentWindowIsReachable(intent, intent.city.timezone)
    ) {
      return 0;
    }

    let notified = 0;
    let hardFailures = 0;
    let cursor: string | undefined;
    while (true) {
      const followers = await prisma.userFavoriteUser.findMany({
        where: followerAudienceWhere(intent.userId, intent.cityId, intent.sport),
        select: {
          id: true,
          user: {
            select: {
              id: true,
              language: true,
              telegramId: true,
              pushTokens: { select: { id: true }, take: 1 },
              notificationPreferences: {
                where: {
                  channelType: {
                    in: [
                      NotificationChannelType.PUSH,
                      NotificationChannelType.TELEGRAM,
                    ],
                  },
                },
                select: {
                  channelType: true,
                  sendPlayIntentSocialNotifications: true,
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (followers.length === 0) break;

      for (let offset = 0; offset < followers.length; offset += 10) {
        const batch = followers.slice(offset, offset + 10);
        const results = await Promise.allSettled(
          batch.map(async ({ user }) => {
            const { title, body } = buildPlayIntentFollowerNotification(
              {
                creatorFirstName: intent.user.firstName,
                sport: intent.sport,
                cityName: intent.city.name,
                timezone: intent.city.timezone,
                dateKeys: intent.dateKeys,
                timeOfDay: intent.timeOfDay,
                startTime: intent.startTime,
                endTime: intent.endTime,
              },
              user.language || 'en',
            );
            const preferenceByChannel = new Map(
              user.notificationPreferences.map((preference) => [
                preference.channelType,
                preference.sendPlayIntentSocialNotifications,
              ]),
            );
            const pushEnabled =
              user.pushTokens.length > 0 &&
              (preferenceByChannel.get(NotificationChannelType.PUSH) ?? true);
            const telegramEnabled =
              Boolean(user.telegramId) &&
              (preferenceByChannel.get(NotificationChannelType.TELEGRAM) ??
                true);
            const channels = [
              ...(pushEnabled ? [NotificationChannelType.PUSH] : []),
              ...(telegramEnabled ? [NotificationChannelType.TELEGRAM] : []),
            ];
            const deliveries =
              await PlayIntentNotificationDeliveryQueueService.enqueue({
                eventKey: `${NotificationType.FOLLOWED_USER_PLAY_INTENT}:${intent.id}`,
                sourceId: intent.id,
                userId: user.id,
                type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
                payload: {
                  type: NotificationType.FOLLOWED_USER_PLAY_INTENT,
                  title,
                  body,
                  data: { playIntentId: intent.id },
                  actions: [
                    {
                      id: 'play-too',
                      title:
                        t('telegram.playToo', user.language || 'en') ||
                        'I want to play too',
                      action: 'play-too',
                    },
                  ],
                  sound: 'default',
                },
                channels,
              });
            return deliveries > 0;
          }),
        );
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            notified += 1;
          } else if (result.status === 'rejected') {
            hardFailures += 1;
            console.error('[PlayIntent] follower delivery failed:', result.reason);
          }
        }
      }
      cursor = followers.at(-1)?.id;
      if (followers.length < 100 || !cursor) break;
    }
    if (hardFailures > 0) return -1;
    return notified;
  }

  static async notifyPlayIntentMatch(proposalId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: {
        city: { select: { name: true, timezone: true } },
        members: {
          include: {
            user: { select: { id: true, language: true, firstName: true } },
          },
        },
      },
    });
    if (!proposal) return;
    if (
      proposal.expiresAt <= new Date() ||
      !intentWindowIsReachable(
        proposalWindowSource(proposal),
        proposal.city.timezone,
      )
    ) {
      return;
    }

    for (const member of proposal.members) {
      const lang = member.user.language || 'en';
      const title = t('playIntent.matchTitle', lang) || 'Players ready to play';
      const body = interpolatePlayIntentCopy(t('playIntent.matchBody', lang), {
        count: String(proposal.members.length),
        sport: formatSportLabel(proposal.sport, lang),
        when: buildPlayIntentWhenLabel(
          {
            timezone: proposal.city.timezone,
            dateKeys: proposal.dateKeys,
            timeOfDay:
              proposal.startTime && proposal.endTime ? 'CUSTOM' : 'ANYTIME',
            startTime: proposal.startTime,
            endTime: proposal.endTime,
          },
          lang,
        ),
        city: proposal.city.name,
      });
      if (
        proposal.expiresAt <= new Date() ||
        !intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
        )
      ) {
        return;
      }

      await enqueueForUser({
        eventKey: `${NotificationType.PLAY_INTENT_MATCH}:${proposal.id}`,
        sourceId: proposal.id,
        userId: member.userId,
        type: NotificationType.PLAY_INTENT_MATCH,
        payload: {
          type: NotificationType.PLAY_INTENT_MATCH,
          title,
          body,
          data: { proposalId, shortDayOfWeek: proposal.dateKeys[0] },
          sound: 'default',
        },
      });
    }
    void PlayIntentNotificationDeliveryQueueService.drain();
  }

  static async notifyGameMatchesIntent(userIds: string[], gameId: string): Promise<number> {
    if (userIds.length === 0) return 0;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        city: { select: { name: true, timezone: true } },
        club: { select: { name: true } },
        participants: {
          where: { status: 'PLAYING' },
          select: { id: true },
        },
      },
    });
    if (!game || !gameStartIsFuture(game.startTime)) return 0;
    if (game.entityType !== EntityType.GAME && game.entityType !== EntityType.BAR) {
      return 0;
    }

    const now = new Date();
    const timezone = game.city?.timezone || 'UTC';
    const dateKey = formatInTimeZone(game.startTime, timezone, 'yyyy-MM-dd');
    const startMinutes = timeStringToMinutes(
      formatInTimeZone(game.startTime, timezone, 'HH:mm'),
    );

    const intents = await prisma.playIntent.findMany({
      where: {
        userId: { in: userIds },
        cityId: game.cityId,
        sport: game.sport,
        entityType: game.entityType,
        status: PlayIntentStatus.OPEN,
        expiresAt: { gt: now },
        gameParticipants: { none: {} },
      },
      include: {
        user: {
          select: {
            id: true,
            language: true,
            gender: true,
            sportProfiles: { select: { sport: true, level: true } },
          },
        },
      },
    });

    const stillMatching = new Map<string, (typeof intents)[number]['user']>();
    for (const intent of intents) {
      if (stillMatching.has(intent.userId)) continue;
      if (!intentWindowIsReachable(intent, timezone, now)) continue;
      if (
        !intentMatchesGame(
          toCriteria(intent),
          {
            entityType: game.entityType,
            dateKey,
            clubId: game.clubId,
            startTime: game.startTime,
            startTimeMinutes: startMinutes,
            minLevel: game.minLevel,
            maxLevel: game.maxLevel,
            genderTeams: game.genderTeams,
          },
          now,
        )
      ) {
        continue;
      }
      stillMatching.set(intent.userId, intent.user);
    }

    let notified = 0;
    for (const user of stillMatching.values()) {
      const lang = user.language || 'en';
      if (!gameStartIsFuture(game.startTime)) return notified;

      const eventKey = `${NotificationType.GAME_MATCHES_INTENT}:${game.id}`;
      const deliveries = await enqueueGameMatchForUser({
        eventKey,
        sourceId: game.id,
        userId: user.id,
        now,
        payload: {
          type: NotificationType.GAME_MATCHES_INTENT,
          title: t('playIntent.gameMatchTitle', lang) || 'A game fits your wish',
          body: interpolatePlayIntentCopy(t('playIntent.gameMatchBody', lang), {
            sport: formatSportLabel(game.sport, lang),
            when: gameScheduleLabel(game.startTime, timezone, lang),
            place: game.club?.name || game.city.name,
            slots: String(
              Math.max(0, game.maxParticipants - game.participants.length),
            ),
          }),
          data: { gameId },
          sound: 'default',
        },
      });
      if (deliveries > 0) notified += 1;
    }
    if (notified > 0) {
      void PlayIntentNotificationDeliveryQueueService.drain();
    }
    return notified;
  }

  static async maybeNotifyOwnerLookingPlayers(gameId: string, ownerId: string, lookingCount: number) {
    if (!ownerId || lookingCount <= 0) return;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        startTime: true,
        sport: true,
        city: { select: { name: true, timezone: true } },
        club: { select: { name: true } },
      },
    });
    if (!game || !gameStartIsFuture(game.startTime)) return;

    const existing = await prisma.playIntentGameOwnerPing.findUnique({
      where: { gameId },
      select: { id: true },
    });
    if (existing) return;

    const recent = await prisma.playIntentGameOwnerPing.count({
      where: {
        ownerId,
        createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
    });
    if (recent >= 2) return;

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { language: true },
    });
    const lang = owner?.language || 'en';

    const channels =
      await PlayIntentNotificationDeliveryQueueService.enabledChannels(
        ownerId,
        NotificationType.INTENT_PLAYERS_FOR_GAME,
      );
    if (channels.length === 0) return;
    if (!gameStartIsFuture(game.startTime)) return;

    const payload: NotificationPayload = {
      type: NotificationType.INTENT_PLAYERS_FOR_GAME,
      title: t('playIntent.ownerPingTitle', lang) || 'Players are looking',
      body: interpolatePlayIntentCopy(t('playIntent.ownerPingBody', lang), {
        count: String(lookingCount),
        sport: formatSportLabel(game.sport, lang),
        when: gameScheduleLabel(game.startTime, game.city.timezone, lang),
        place: game.club?.name || game.city.name,
      }),
      data: { gameId },
      sound: 'default',
    };

    try {
      await prisma.$transaction(async (tx) => {
        await tx.playIntentGameOwnerPing.create({
          data: { gameId, ownerId },
        });
        await PlayIntentNotificationDeliveryQueueService.enqueue(
          {
            eventKey: `${NotificationType.INTENT_PLAYERS_FOR_GAME}:${gameId}`,
            sourceId: gameId,
            userId: ownerId,
            type: NotificationType.INTENT_PLAYERS_FOR_GAME,
            payload,
            channels,
          },
          tx,
        );
      });
      void PlayIntentNotificationDeliveryQueueService.drain();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }
}
