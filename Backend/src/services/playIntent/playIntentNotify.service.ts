import prisma from '../../config/database';
import notificationService from '../notification.service';
import { NotificationPreferenceService } from '../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { NotificationType, PreferenceKey } from '../../types/notifications.types';
import { t } from '../../utils/translations';

const PREF = PreferenceKey.SEND_PLAY_INTENT_NOTIFICATIONS;

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
        members: {
          include: {
            user: { select: { id: true, language: true, firstName: true } },
          },
        },
      },
    });
    if (!proposal) return;

    for (const member of proposal.members) {
      const lang = member.user.language || 'en';
      const title = t('playIntent.matchTitle', lang) || 'Players ready to play';
      const body =
        t('playIntent.matchBody', lang) ||
        `${proposal.members.length} players match your wish — open to form a game`;

      const { allowedPush, allowedTelegram } = await channelAllows(member.userId);
      if (!allowedPush && !allowedTelegram) continue;

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

  static async notifyGameMatchesIntent(userIds: string[], gameId: string) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, language: true },
    });

    for (const user of users) {
      const lang = user.language || 'en';
      const { allowedPush, allowedTelegram } = await channelAllows(user.id);
      if (!allowedPush && !allowedTelegram) continue;

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
    }
  }

  static async maybeNotifyOwnerLookingPlayers(gameId: string, ownerId: string, lookingCount: number) {
    if (!ownerId || lookingCount <= 0) return;

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
