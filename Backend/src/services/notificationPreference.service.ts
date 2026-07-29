import prisma from '../config/database';
import { NotificationChannelType } from '@prisma/client';
import { NotificationType, PreferenceKey } from '../types/notifications.types';

export { PreferenceKey } from '../types/notifications.types';

export const NOTIFICATION_TYPE_TO_PREF: Record<NotificationType, PreferenceKey> = {
  [NotificationType.INVITE]: PreferenceKey.SEND_INVITES,
  [NotificationType.USER_CHAT]: PreferenceKey.SEND_DIRECT_MESSAGES,
  [NotificationType.GAME_REMINDER]: PreferenceKey.SEND_REMINDERS,
  [NotificationType.TRANSACTION]: PreferenceKey.SEND_WALLET_NOTIFICATIONS,
  [NotificationType.GAME_CHAT]: PreferenceKey.SEND_MESSAGES,
  [NotificationType.BUG_CHAT]: PreferenceKey.SEND_MESSAGES,
  [NotificationType.GROUP_CHAT]: PreferenceKey.SEND_MESSAGES,
  [NotificationType.GAME_SYSTEM_MESSAGE]: PreferenceKey.SEND_MESSAGES,
  [NotificationType.GAME_RESULTS]: PreferenceKey.SEND_MESSAGES,
  [NotificationType.NEW_GAME]: PreferenceKey.SEND_MESSAGES,
  [NotificationType.NEW_MARKET_ITEM]: PreferenceKey.SEND_MARKETPLACE_NOTIFICATIONS,
  [NotificationType.NEW_BUG]: PreferenceKey.SEND_MESSAGES,
  [NotificationType.AUCTION_OUTBID]: PreferenceKey.SEND_MARKETPLACE_NOTIFICATIONS,
  [NotificationType.AUCTION_NEW_BID]: PreferenceKey.SEND_MARKETPLACE_NOTIFICATIONS,
  [NotificationType.AUCTION_WON]: PreferenceKey.SEND_MARKETPLACE_NOTIFICATIONS,
  [NotificationType.AUCTION_BIN_ACCEPTED]: PreferenceKey.SEND_MARKETPLACE_NOTIFICATIONS,
  [NotificationType.GAME_CANCELLED]: PreferenceKey.SEND_REMINDERS,
  [NotificationType.MATCH_TIMER_CAP]: PreferenceKey.SEND_REMINDERS,
  [NotificationType.TEAM_INVITE]: PreferenceKey.SEND_TEAM_NOTIFICATIONS,
  [NotificationType.TEAM_INVITE_ACCEPTED]: PreferenceKey.SEND_TEAM_NOTIFICATIONS,
  [NotificationType.TEAM_INVITE_DECLINED]: PreferenceKey.SEND_TEAM_NOTIFICATIONS,
  [NotificationType.TEAM_MEMBER_REMOVED]: PreferenceKey.SEND_TEAM_NOTIFICATIONS,
  [NotificationType.TEAM_MEMBER_LEFT]: PreferenceKey.SEND_TEAM_NOTIFICATIONS,
  [NotificationType.TEAM_DELETED]: PreferenceKey.SEND_TEAM_NOTIFICATIONS,
  [NotificationType.PLAY_INTENT_MATCH]: PreferenceKey.SEND_PLAY_INTENT_NOTIFICATIONS,
  [NotificationType.GAME_MATCHES_INTENT]: PreferenceKey.SEND_PLAY_INTENT_NOTIFICATIONS,
  [NotificationType.INTENT_PLAYERS_FOR_GAME]: PreferenceKey.SEND_PLAY_INTENT_NOTIFICATIONS,
};

export type NotificationPreferenceData = {
  channelType: NotificationChannelType;
  sendMessages: boolean;
  sendInvites: boolean;
  sendDirectMessages: boolean;
  sendReminders: boolean;
  sendWalletNotifications: boolean;
  sendMarketplaceNotifications: boolean;
  sendTeamNotifications: boolean;
  sendPlayIntentNotifications: boolean;
};

type PrefFlags = Omit<NotificationPreferenceData, 'channelType'>;

export const DEFAULT_PREFERENCES: PrefFlags = {
  sendMessages: true,
  sendInvites: true,
  sendDirectMessages: true,
  sendReminders: true,
  sendWalletNotifications: true,
  sendMarketplaceNotifications: true,
  sendTeamNotifications: true,
  sendPlayIntentNotifications: true,
};

function toData(
  channelType: NotificationChannelType,
  p: PrefFlags,
): NotificationPreferenceData {
  return {
    channelType,
    sendMessages: p.sendMessages,
    sendInvites: p.sendInvites,
    sendDirectMessages: p.sendDirectMessages,
    sendReminders: p.sendReminders,
    sendWalletNotifications: p.sendWalletNotifications,
    sendMarketplaceNotifications: p.sendMarketplaceNotifications,
    sendTeamNotifications: p.sendTeamNotifications,
    sendPlayIntentNotifications: p.sendPlayIntentNotifications,
  };
}

function countTrue(p: PrefFlags): number {
  return [
    p.sendMessages,
    p.sendInvites,
    p.sendDirectMessages,
    p.sendReminders,
    p.sendWalletNotifications,
    p.sendMarketplaceNotifications,
    p.sendTeamNotifications,
    p.sendPlayIntentNotifications,
  ].filter(Boolean).length;
}

function flagsFromRow(p: {
  sendMessages: boolean;
  sendInvites: boolean;
  sendDirectMessages: boolean;
  sendReminders: boolean;
  sendWalletNotifications: boolean;
  sendMarketplaceNotifications: boolean;
  sendTeamNotifications: boolean;
  sendPlayIntentNotifications: boolean;
}): PrefFlags {
  return {
    sendMessages: p.sendMessages,
    sendInvites: p.sendInvites,
    sendDirectMessages: p.sendDirectMessages,
    sendReminders: p.sendReminders,
    sendWalletNotifications: p.sendWalletNotifications,
    sendMarketplaceNotifications: p.sendMarketplaceNotifications,
    sendTeamNotifications: p.sendTeamNotifications,
    sendPlayIntentNotifications: p.sendPlayIntentNotifications,
  };
}

export class NotificationPreferenceService {
  static async getForUser(userId: string): Promise<NotificationPreferenceData[]> {
    const [prefs, user, pushCount] = await Promise.all([
      prisma.notificationPreference.findMany({
        where: { userId },
        orderBy: { channelType: 'asc' },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true },
      }),
      prisma.pushToken.count({ where: { userId } }),
    ]);
    const hasTelegram = !!user?.telegramId;
    const hasPush = pushCount > 0;
    return prefs
      .filter(
        (p) =>
          (p.channelType === NotificationChannelType.TELEGRAM && hasTelegram) ||
          (p.channelType === NotificationChannelType.PUSH && hasPush),
      )
      .map((p) => toData(p.channelType, flagsFromRow(p)));
  }

  static async ensurePreferenceForChannel(
    userId: string,
    channelType: NotificationChannelType,
  ): Promise<NotificationPreferenceData | null> {
    const existing = await prisma.notificationPreference.findUnique({
      where: { userId_channelType: { userId, channelType } },
    });
    if (existing) {
      return toData(existing.channelType, flagsFromRow(existing));
    }

    const otherPrefs = await prisma.notificationPreference.findMany({
      where: { userId },
    });

    const basePrefs =
      otherPrefs.length > 0
        ? (() => {
            const mostTrue = otherPrefs.reduce(
              (best, p) => {
                const trueCount = countTrue(flagsFromRow(p));
                return trueCount > best.count ? { prefs: flagsFromRow(p), count: trueCount } : best;
              },
              { prefs: flagsFromRow(otherPrefs[0]), count: 0 },
            );
            return mostTrue.prefs;
          })()
        : DEFAULT_PREFERENCES;

    const created = await prisma.notificationPreference.create({
      data: {
        userId,
        channelType,
        ...basePrefs,
      },
    });

    return toData(created.channelType, flagsFromRow(created));
  }

  static async updatePreference(
    userId: string,
    channelType: NotificationChannelType,
    data: Partial<PrefFlags>,
  ): Promise<NotificationPreferenceData | null> {
    const updated = await prisma.notificationPreference.upsert({
      where: { userId_channelType: { userId, channelType } },
      create: {
        userId,
        channelType,
        ...DEFAULT_PREFERENCES,
        ...data,
      },
      update: data,
    });
    return toData(updated.channelType, flagsFromRow(updated));
  }

  static async updateMany(
    userId: string,
    preferences: Array<{ channelType: NotificationChannelType } & Partial<PrefFlags>>,
  ): Promise<NotificationPreferenceData[]> {
    const results = await Promise.all(
      preferences.map((pref) => {
        const { channelType, ...rest } = pref;
        return this.updatePreference(userId, channelType, rest);
      }),
    );
    return results.filter((r): r is NotificationPreferenceData => r != null);
  }

  static async getPreferenceForChannel(
    userId: string,
    channelType: NotificationChannelType,
  ): Promise<NotificationPreferenceData | null> {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_channelType: { userId, channelType } },
    });
    if (!pref) return null;
    return toData(pref.channelType, flagsFromRow(pref));
  }

  static async getPreferenceMapForUser(
    userId: string,
  ): Promise<Record<NotificationChannelType, NotificationPreferenceData | null>> {
    const prefs = await this.getForUser(userId);
    const map: Record<string, NotificationPreferenceData | null> = {
      PUSH: null,
      TELEGRAM: null,
      WHATSAPP: null,
      VIBER: null,
    };
    for (const p of prefs) {
      map[p.channelType] = p;
    }
    return map as Record<NotificationChannelType, NotificationPreferenceData | null>;
  }

  static async getEffectivePreferencesForNotification(userId: string): Promise<{
    telegram: PrefFlags | null;
    push: PrefFlags | null;
  }> {
    const [user, prefs, pushCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          telegramId: true,
          sendTelegramMessages: true,
          sendTelegramInvites: true,
          sendTelegramDirectMessages: true,
          sendTelegramReminders: true,
          sendTelegramWalletNotifications: true,
          sendPushMessages: true,
          sendPushInvites: true,
          sendPushDirectMessages: true,
          sendPushReminders: true,
          sendPushWalletNotifications: true,
        },
      }),
      prisma.notificationPreference.findMany({ where: { userId } }),
      prisma.pushToken.count({ where: { userId } }),
    ]);

    if (!user) return { telegram: null, push: null };

    const hasTelegram = !!user.telegramId;
    const hasPush = pushCount > 0;
    const prefMap: Record<string, PrefFlags | null> = { PUSH: null, TELEGRAM: null };
    for (const p of prefs) {
      if (
        (p.channelType === NotificationChannelType.TELEGRAM && hasTelegram) ||
        (p.channelType === NotificationChannelType.PUSH && hasPush)
      ) {
        prefMap[p.channelType] = flagsFromRow(p);
      }
    }

    const telegramPref = hasTelegram
      ? prefMap.TELEGRAM ??
        /* REMOVE_BY_10_02_2026 */ {
          sendMessages: user.sendTelegramMessages,
          sendInvites: user.sendTelegramInvites,
          sendDirectMessages: user.sendTelegramDirectMessages,
          sendReminders: user.sendTelegramReminders,
          sendWalletNotifications: user.sendTelegramWalletNotifications,
          sendMarketplaceNotifications: true,
          sendTeamNotifications: true,
          sendPlayIntentNotifications: true,
        }
      : null;

    const pushPref = hasPush
      ? prefMap.PUSH ??
        /* REMOVE_BY_10_02_2026 */ {
          sendMessages: user.sendPushMessages,
          sendInvites: user.sendPushInvites,
          sendDirectMessages: user.sendPushDirectMessages,
          sendReminders: user.sendPushReminders,
          sendWalletNotifications: user.sendPushWalletNotifications,
          sendMarketplaceNotifications: true,
          sendTeamNotifications: true,
          sendPlayIntentNotifications: true,
        }
      : null;

    return { telegram: telegramPref, push: pushPref };
  }

  static async hasChannel(userId: string, channelType: NotificationChannelType): Promise<boolean> {
    if (channelType === NotificationChannelType.TELEGRAM) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true },
      });
      return !!user?.telegramId;
    }
    if (channelType === NotificationChannelType.PUSH) {
      const count = await prisma.pushToken.count({ where: { userId } });
      return count > 0;
    }
    return false;
  }

  static async deletePreferenceForChannel(
    userId: string,
    channelType: NotificationChannelType,
  ): Promise<void> {
    await prisma.notificationPreference.deleteMany({
      where: { userId, channelType },
    });
  }

  static async doesUserAllow(
    userId: string,
    channelType: NotificationChannelType,
    preferenceKey: PreferenceKey,
  ): Promise<boolean> {
    const hasCh = await this.hasChannel(userId, channelType);
    if (!hasCh) return false;

    const prefs = await this.getEffectivePreferencesForNotification(userId);
    const channelPrefs = channelType === NotificationChannelType.TELEGRAM ? prefs.telegram : prefs.push;
    if (!channelPrefs) return false;

    return !!channelPrefs[preferenceKey];
  }
}
