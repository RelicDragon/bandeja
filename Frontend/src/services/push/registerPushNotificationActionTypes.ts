import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from '@/i18n/config';
import { isIOS } from '@/utils/capacitor';
import {
  PUSH_ACTION_ACCEPT,
  PUSH_ACTION_DECLINE,
  PUSH_ACTION_REPLY,
  PUSH_CATEGORY_CHAT_REPLY,
  PUSH_CATEGORY_INVITE,
  PUSH_CATEGORY_TEAM_INVITE,
} from './pushNotificationConstants';

export async function registerPushNotificationActionTypes(): Promise<void> {
  if (!isIOS()) {
    return;
  }

  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: PUSH_CATEGORY_INVITE,
        actions: [
          { id: PUSH_ACTION_ACCEPT, title: i18n.t('invites.accept') },
          { id: PUSH_ACTION_DECLINE, title: i18n.t('invites.decline') },
        ],
      },
      {
        id: PUSH_CATEGORY_TEAM_INVITE,
        actions: [
          { id: PUSH_ACTION_ACCEPT, title: i18n.t('invites.accept') },
          { id: PUSH_ACTION_DECLINE, title: i18n.t('invites.decline') },
        ],
      },
      {
        id: PUSH_CATEGORY_CHAT_REPLY,
        actions: [
          {
            id: PUSH_ACTION_REPLY,
            title: i18n.t('push.reply'),
            input: true,
            inputPlaceholder: i18n.t('push.replyPlaceholder'),
          },
        ],
      },
    ],
  });
}
