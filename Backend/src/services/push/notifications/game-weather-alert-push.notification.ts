/**
 * PRD 357 — "rain is likely for your outdoor game" push.
 *
 * Two copy variants share one builder: the organizer gets the actions that can
 * actually fix the game (**Move indoor** / **Keep as planned**), the
 * participants get **View forecast**. Both variants lead with the number and
 * the hour, because that is what the reader decides on.
 *
 * Percentages, wind speeds and clock times come from `Intl` for the recipient's
 * language (`weatherAlertCopy.ts`) — no template in this feature contains a
 * `%`, a `km/h` or an hour format.
 */
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { signPushInviteActionToken } from '../pushInviteActionToken.service';
import {
  formatClockTime,
  formatPercent,
  formatWindSpeed,
  weatherT,
  type WeatherCopyKey,
} from '../../weather/weatherAlertCopy';
import type { WeatherRiskSeverity } from '../../weather/weatherRisk';

export type WeatherAlertRecipientRole = 'organizer' | 'participant';

/**
 * APNs notification categories. The ids are mirrored by
 * `Frontend/src/services/push/pushNotificationConstants.ts`, which registers the
 * matching `UNNotificationCategory` on iOS — a category the app has not
 * registered simply shows no buttons, so the two must stay in step.
 */
export const WEATHER_PARTICIPANT_PUSH_CATEGORY = 'GAME_WEATHER_ALERT';
export const WEATHER_ORGANIZER_PUSH_CATEGORY = 'GAME_WEATHER_ALERT_ORGANIZER';

export interface WeatherAlertPushInput {
  gameId: string;
  entityType: string;
  severity: WeatherRiskSeverity;
  /** Peak precipitation probability across the game window, 0–100. */
  pop: number;
  /** Peak wind across the game window, km/h. */
  windKph: number;
  /** ISO time of the hour the numbers describe. */
  at: string;
  /** IANA timezone of the club/city, so "19:00" is the local hour. */
  timeZone?: string | null;
  /** "Padel Centar court 3 (outdoor)" — already assembled by the caller. */
  place: string;
  /** `true` for the 2 h "forecast got worse" alert. */
  escalated: boolean;
  /** Rain reads amber, wind reads slate — and picks a different title. */
  windDriven: boolean;
}

export interface WeatherAlertPushRecipient {
  id: string;
  language?: string | null;
  role: WeatherAlertRecipientRole;
}

function titleKey(input: WeatherAlertPushInput): WeatherCopyKey {
  if (input.escalated) return 'weather.alertTitleWorse';
  if (input.windDriven) return 'weather.alertTitleWind';
  if (input.severity === 'storm') return 'weather.alertTitleStorm';
  if (input.severity === 'heavy') return 'weather.alertTitleHeavy';
  return 'weather.alertTitleRain';
}

/** The in-app destination for a tapped alert. Consumed and cleaned by the game page. */
export function weatherAlertDeepLink(gameId: string, role: WeatherAlertRecipientRole): string {
  return role === 'organizer'
    ? `/games/${gameId}?section=weather&action=moveIndoor`
    : `/games/${gameId}?section=weather`;
}

export function createGameWeatherAlertPushNotification(
  input: WeatherAlertPushInput,
  recipient: WeatherAlertPushRecipient,
): NotificationPayload {
  const lang = recipient.language || 'en';
  const time = formatClockTime(input.at, lang, input.timeZone);

  const title = weatherT(titleKey(input), lang);
  const detail = input.windDriven
    ? weatherT('weather.alertBodyWind', lang, {
        wind: formatWindSpeed(input.windKph, lang),
        time,
        place: input.place,
      })
    : weatherT('weather.alertBodyRain', lang, {
        pop: formatPercent(input.pop, lang),
        time,
        place: input.place,
      });

  const hint = weatherT(
    recipient.role === 'organizer'
      ? 'weather.alertOrganizerHint'
      : 'weather.alertParticipantHint',
    lang,
  );

  const deepLink = weatherAlertDeepLink(input.gameId, recipient.role);

  if (recipient.role !== 'organizer') {
    const forecastTitle = weatherT('weather.actionViewForecast', lang);
    return {
      type: NotificationType.GAME_WEATHER_ALERT,
      title,
      body: `${detail}\n${hint}`,
      // iOS categories are static, so the two variants cannot share one id: the
      // participant shade shows one button, the organizer's shows two.
      category: WEATHER_PARTICIPANT_PUSH_CATEGORY,
      data: {
        gameId: input.gameId,
        entityType: input.entityType,
        weatherDeepLink: deepLink,
        weatherSeverity: input.severity,
      },
      actions: [{ id: 'forecast', title: forecastTitle, action: 'forecast' }],
      sound: 'default',
    };
  }

  const moveIndoorTitle = weatherT('weather.actionMoveIndoor', lang);
  const keepTitle = weatherT('weather.actionKeepAsPlanned', lang);

  return {
    type: NotificationType.GAME_WEATHER_ALERT,
    title,
    body: `${detail}\n${hint}`,
    category: WEATHER_ORGANIZER_PUSH_CATEGORY,
    data: {
      gameId: input.gameId,
      entityType: input.entityType,
      weatherDeepLink: deepLink,
      weatherSeverity: input.severity,
      moveIndoorActionTitle: moveIndoorTitle,
      keepActionTitle: keepTitle,
      weatherKeptAck: weatherT('weather.keptAsPlanned', lang),
      weatherKeepActionToken: signPushInviteActionToken({
        userId: recipient.id,
        kind: 'weather',
        targetId: input.gameId,
        action: 'keep',
      }),
    },
    actions: [
      { id: 'moveIndoor', title: moveIndoorTitle, action: 'moveIndoor' },
      { id: 'keep', title: keepTitle, action: 'keep' },
    ],
    sound: 'default',
  };
}
