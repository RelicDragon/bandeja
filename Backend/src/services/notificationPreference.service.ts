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
};

export type NotificationPreferenceData = {
  channelType: NotificationChannelType;
  sendMessages: boolean;
  sendInvites: boolean;
  sendDirectMessages: boolean;
  sendReminders: boolean;
  sendWalletNotifications: boolean;
};

export const DEFAULT_PREFERENCES: Omit<NotificationPreferenceData, 'channelType'> = {
  sendMessages: true,
  sendInvites: true,
  sendDirectMessages: true,
  sendReminders: true,
  sendWalletNotifications: true,
};

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
      .filter((p) => (p.channelType === NotificationChannelType.TELEGRAM && hasTelegram) || (p.channelType === NotificationChannelType.PUSH && hasPush))
      .map((p) => ({
        channelType: p.channelType,
        sendMessages: p.sendMessages,
        sendInvites: p.sendInvites,
        sendDirectMessages: p.sendDirectMessages,
        sendReminders: p.sendReminders,
        sendWalletNotifications: p.sendWalletNotifications,
      }));
  }

  static async ensurePreferenceForChannel(
    userId: string,
    channelType: NotificationChannelType
  ): Promise<NotificationPreferenceData | null> {
    const existing = await prisma.notificationPreference.findUnique({
      where: { userId_channelType: { userId, channelType } },
    });
    if (existing) {
      return {
        channelType: existing.channelType,
        sendMessages: existing.sendMessages,
        sendInvites: existing.sendInvites,
        sendDirectMessages: existing.sendDirectMessages,
        sendReminders: existing.sendReminders,
        sendWalletNotifications: existing.sendWalletNotifications,
      };
    }

    const otherPrefs = await prisma.notificationPreference.findMany({
      where: { userId },
    });

    const basePrefs = otherPrefs.length > 0
      ? (() => {
          const mostTrue = otherPrefs.reduce((best, p) => {
            const trueCount = [p.sendMessages, p.sendInvites, p.sendDirectMessages, p.sendReminders, p.sendWalletNotifications].filter(Boolean).length;
            return trueCount > best.count ? { prefs: p, count: trueCount } : best;
          }, { prefs: otherPrefs[0], count: 0 });
          return {
            sendMessages: mostTrue.prefs.sendMessages,
            sendInvites: mostTrue.prefs.sendInvites,
            sendDirectMessages: mostTrue.prefs.sendDirectMessages,
            sendReminders: mostTrue.prefs.sendReminders,
            sendWalletNotifications: mostTrue.prefs.sendWalletNotifications,
          };
        })()
      : DEFAULT_PREFERENCES;

    const created = await prisma.notificationPreference.create({
      data: {
        userId,
        channelType,
        ...basePrefs,
      },
    });

    return {
      channelType: created.channelType,
      sendMessages: created.sendMessages,
      sendInvites: created.sendInvites,
      sendDirectMessages: created.sendDirectMessages,
      sendReminders: created.sendReminders,
      sendWalletNotifications: created.sendWalletNotifications,
    };
  }

  static async updatePreference(
    userId: string,
    channelType: NotificationChannelType,
    data: Partial<Omit<NotificationPreferenceData, 'channelType'>>
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
    return {
      channelType: updated.channelType,
      sendMessages: updated.sendMessages,
      sendInvites: updated.sendInvites,
      sendDirectMessages: updated.sendDirectMessages,
      sendReminders: updated.sendReminders,
      sendWalletNotifications: updated.sendWalletNotifications,
    };
  }

  static async updateMany(
    userId: string,
    preferences: Array<{ channelType: NotificationChannelType } & Partial<Omit<NotificationPreferenceData, 'channelType'>>>
  ): Promise<NotificationPreferenceData[]> {
    const results = await Promise.all(
      preferences.map((pref) => {
        const { channelType, ...rest } = pref;
        return this.updatePreference(userId, channelType, rest);
      })
    );
    return results.filter((r): r is NotificationPreferenceData => r != null);
  }

  static async getPreferenceForChannel(
    userId: string,
    channelType: NotificationChannelType
  ): Promise<NotificationPreferenceData | null> {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_channelType: { userId, channelType } },
    });
    if (!pref) return null;
    return {
      channelType: pref.channelType,
      sendMessages: pref.sendMessages,
      sendInvites: pref.sendInvites,
      sendDirectMessages: pref.sendDirectMessages,
      sendReminders: pref.sendReminders,
      sendWalletNotifications: pref.sendWalletNotifications,
    };
  }

  static async getPreferenceMapForUser(userId: string): Promise<Record<NotificationChannelType, NotificationPreferenceData | null>> {
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
    telegram: { sendMessages: boolean; sendInvites: boolean; sendDirectMessages: boolean; sendReminders: boolean; sendWalletNotifications: boolean } | null;
    push: { sendMessages: boolean; sendInvites: boolean; sendDirectMessages: boolean; sendReminders: boolean; sendWalletNotifications: boolean } | null;
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
    const prefMap: Record<string, NotificationPreferenceData | null> = { PUSH: null, TELEGRAM: null };
    for (const p of prefs) {
      if ((p.channelType === NotificationChannelType.TELEGRAM && hasTelegram) || (p.channelType === NotificationChannelType.PUSH && hasPush)) {
        prefMap[p.channelType] = {
          channelType: p.channelType,
          sendMessages: p.sendMessages,
          sendInvites: p.sendInvites,
          sendDirectMessages: p.sendDirectMessages,
          sendReminders: p.sendReminders,
          sendWalletNotifications: p.sendWalletNotifications,
        };
      }
    }

    const toPref = (p: { sendMessages: boolean; sendInvites: boolean; sendDirectMessages: boolean; sendReminders: boolean; sendWalletNotifications: boolean }) => p;

    const telegramPref = hasTelegram
      ? (prefMap.TELEGRAM
          ? toPref(prefMap.TELEGRAM)
          : /* REMOVE_BY_10_02_2026 */ toPref({
              sendMessages: user.sendTelegramMessages,
              sendInvites: user.sendTelegramInvites,
              sendDirectMessages: user.sendTelegramDirectMessages,
              sendReminders: user.sendTelegramReminders,
              sendWalletNotifications: user.sendTelegramWalletNotifications,
            }))
      : null;

    const pushPref = hasPush
      ? (prefMap.PUSH
          ? toPref(prefMap.PUSH)
          : /* REMOVE_BY_10_02_2026 */ toPref({
              sendMessages: user.sendPushMessages,
              sendInvites: user.sendPushInvites,
              sendDirectMessages: user.sendPushDirectMessages,
              sendReminders: user.sendPushReminders,
              sendWalletNotifications: user.sendPushWalletNotifications,
            }))
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

  static async deletePreferenceForChannel(userId: string, channelType: NotificationChannelType): Promise<void> {
    await prisma.notificationPreference.deleteMany({
      where: { userId, channelType },
    });
  }

  static async doesUserAllow(
    userId: string,
    channelType: NotificationChannelType,
    preferenceKey: PreferenceKey
  ): Promise<boolean> {
    const hasCh = await this.hasChannel(userId, channelType);
    if (!hasCh) return false;

    const prefs = await this.getEffectivePreferencesForNotification(userId);
    const channelPrefs = channelType === NotificationChannelType.TELEGRAM ? prefs.telegram : prefs.push;
    if (!channelPrefs) return false;

    return !!channelPrefs[preferenceKey];
  }
}
