import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from '@/i18n/config';
import { isIOS } from '@/utils/capacitor';
import {
  PUSH_ACTION_ACCEPT,
  PUSH_ACTION_ATTENDANCE_CONFIRM,
  PUSH_ACTION_ATTENDANCE_UNSURE,
  PUSH_ACTION_DECLINE,
  PUSH_ACTION_PLAY_TOO,
  PUSH_ACTION_REPLY,
  PUSH_ACTION_WEATHER_FORECAST,
  PUSH_ACTION_WEATHER_KEEP,
  PUSH_ACTION_WEATHER_MOVE_INDOOR,
  PUSH_CATEGORY_CHAT_REPLY,
  PUSH_CATEGORY_GAME_REMINDER,
  PUSH_CATEGORY_GAME_SERIES_NEXT_PROMPT,
  PUSH_CATEGORY_GAME_WEATHER_ALERT,
  PUSH_CATEGORY_GAME_WEATHER_ALERT_ORGANIZER,
  PUSH_CATEGORY_INVITE,
  PUSH_CATEGORY_PLAY_INTENT,
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
      {
        id: PUSH_CATEGORY_PLAY_INTENT,
        actions: [
          {
            id: PUSH_ACTION_PLAY_TOO,
            title: i18n.t('playIntent.playToo'),
          },
        ],
      },
      {
        // PRD 346 — both answers stay in the shade (no `foreground`): answering
        // is a courtesy signal, not a reason to pull somebody into the app.
        id: PUSH_CATEGORY_GAME_REMINDER,
        actions: [
          {
            id: PUSH_ACTION_ATTENDANCE_CONFIRM,
            title: i18n.t('attendance.confirm'),
          },
          {
            id: PUSH_ACTION_ATTENDANCE_UNSURE,
            title: i18n.t('attendance.unsure'),
          },
        ],
      },
      {
        // PRD 345 — keeping next week's seat is a one-tap answer; neither branch
        // needs the app, so both stay in the shade.
        id: PUSH_CATEGORY_GAME_SERIES_NEXT_PROMPT,
        actions: [
          { id: PUSH_ACTION_ACCEPT, title: i18n.t('series.imIn') },
          { id: PUSH_ACTION_DECLINE, title: i18n.t('series.skip') },
        ],
      },
      {
        // PRD 357 — a participant can only look at the forecast, which means
        // opening the app.
        id: PUSH_CATEGORY_GAME_WEATHER_ALERT,
        actions: [
          {
            id: PUSH_ACTION_WEATHER_FORECAST,
            title: i18n.t('weatherAlerts.forecast'),
            foreground: true,
          },
        ],
      },
      {
        // The organizer's pair: "Move indoor" needs the sheet (foreground),
        // "Keep as planned" is a silent token post.
        id: PUSH_CATEGORY_GAME_WEATHER_ALERT_ORGANIZER,
        actions: [
          {
            id: PUSH_ACTION_WEATHER_MOVE_INDOOR,
            title: i18n.t('weatherAlerts.moveIndoor'),
            foreground: true,
          },
          { id: PUSH_ACTION_WEATHER_KEEP, title: i18n.t('weatherAlerts.keepAsPlanned') },
        ],
      },
    ],
  });
}
