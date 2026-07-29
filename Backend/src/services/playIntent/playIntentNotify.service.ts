import prisma from '../../config/database';
import notificationService from '../notification.service';
import { NotificationPreferenceService } from '../notificationPreference.service';
import {
  EntityType,
  NotificationChannelType,
  PlayIntentStatus,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { NotificationType, PreferenceKey } from '../../types/notifications.types';
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

const PREF = PreferenceKey.SEND_PLAY_INTENT_NOTIFICATIONS;

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

async function channelAllows(userId: string) {
  const [allowedPush, allowedTelegram] = await Promise.all([
    NotificationPreferenceService.doesUserAllow(userId, NotificationChannelType.PUSH, PREF),
    NotificationPreferenceService.doesUserAllow(userId, NotificationChannelType.TELEGRAM, PREF),
  ]);
  return { allowedPush, allowedTelegram };
}

export class PlayIntentNotifyService {
  static async notifyPlayIntentMatch(proposalId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: {
        city: { select: { timezone: true } },
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
      const body =
        t('playIntent.matchBody', lang) ||
        `${proposal.members.length} players match your wish — open to form a game`;

      const { allowedPush, allowedTelegram } = await channelAllows(member.userId);
      if (!allowedPush && !allowedTelegram) continue;
      if (
        proposal.expiresAt <= new Date() ||
        !intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
        )
      ) {
        return;
      }

      await notificationService.sendNotification({
        userId: member.userId,
        type: NotificationType.PLAY_INTENT_MATCH,
        payload: {
          type: NotificationType.PLAY_INTENT_MATCH,
          title,
          body,
          data: { proposalId, shortDayOfWeek: proposal.dateKeys[0] },
          sound: 'default',
        },
        preferPush: allowedPush,
        preferTelegram: allowedTelegram,
      });
    }
  }

  static async notifyGameMatchesIntent(userIds: string[], gameId: string): Promise<number> {
    if (userIds.length === 0) return 0;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { city: { select: { timezone: true } } },
    });
    if (!game || !gameStartIsFuture(game.startTime)) return 0;

    const now = new Date();
    const timezone = game.city?.timezone || 'UTC';
    const intentEntityType =
      game.entityType === EntityType.BAR ? EntityType.BAR : EntityType.GAME;
    const dateKey = formatInTimeZone(game.startTime, timezone, 'yyyy-MM-dd');
    const startMinutes = timeStringToMinutes(
      formatInTimeZone(game.startTime, timezone, 'HH:mm'),
    );

    const intents = await prisma.playIntent.findMany({
      where: {
        userId: { in: userIds },
        cityId: game.cityId,
        sport: game.sport,
        entityType: intentEntityType,
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
      const { allowedPush, allowedTelegram } = await channelAllows(user.id);
      if (!allowedPush && !allowedTelegram) continue;
      if (!gameStartIsFuture(game.startTime)) return notified;

      await notificationService.sendNotification({
        userId: user.id,
        type: NotificationType.GAME_MATCHES_INTENT,
        payload: {
          type: NotificationType.GAME_MATCHES_INTENT,
          title: t('playIntent.gameMatchTitle', lang) || 'A game fits your wish',
          body: t('playIntent.gameMatchBody', lang) || 'Open to join — slots are available',
          data: { gameId },
          sound: 'default',
        },
        preferPush: allowedPush,
        preferTelegram: allowedTelegram,
      });
      notified += 1;
    }
    return notified;
  }

  static async maybeNotifyOwnerLookingPlayers(gameId: string, ownerId: string, lookingCount: number) {
    if (!ownerId || lookingCount <= 0) return;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { startTime: true },
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

    await prisma.playIntentGameOwnerPing.create({
      data: { gameId, ownerId },
    });

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { language: true },
    });
    const lang = owner?.language || 'en';

    const { allowedPush, allowedTelegram } = await channelAllows(ownerId);
    if (!allowedPush && !allowedTelegram) return;
    if (!gameStartIsFuture(game.startTime)) return;

    await notificationService.sendNotification({
      userId: ownerId,
      type: NotificationType.INTENT_PLAYERS_FOR_GAME,
      payload: {
        type: NotificationType.INTENT_PLAYERS_FOR_GAME,
        title: t('playIntent.ownerPingTitle', lang) || 'Players are looking',
        body: t('playIntent.ownerPingBody', lang) || `Someone nearby wants a game like yours`,
        data: { gameId },
        sound: 'default',
      },
      preferPush: allowedPush,
      preferTelegram: allowedTelegram,
    });
  }
}
