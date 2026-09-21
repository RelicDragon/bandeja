/**
 * PRD 357 — "Keep as planned" from the weather alert's push shade.
 *
 * Posts the signed `weather:keep` token and nothing else: the game does not
 * move, the roster does not change, and the only visible effect is that the 2 h
 * escalation stops firing. The other two actions ("Move indoor", "View
 * forecast") are foreground taps that ride `weatherDeepLink` into the app, so
 * they are not handled here.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from '@/i18n/config';
import api from '@/api/axios';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import { PUSH_ACTION_WEATHER_KEEP } from './pushNotificationConstants';

const LOG_PREFIX = '[weather-push]';

export const WEATHER_PUSH_TYPE = 'GAME_WEATHER_ALERT';

export interface WeatherPushActionData {
  type: string;
  data?: {
    gameId?: string;
    weatherKeepActionToken?: string;
  };
}

/** The signed token for this action, or `null` when the push does not carry one. */
export function resolveWeatherKeepToken(
  actionId: string,
  data: WeatherPushActionData,
): string | null {
  if (data.type !== WEATHER_PUSH_TYPE || actionId !== PUSH_ACTION_WEATHER_KEEP) {
    return null;
  }
  const token = data.data?.weatherKeepActionToken;
  return token?.trim() ? token : null;
}

async function scheduleAcknowledgement(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2_147_483_647),
          title: i18n.t('weatherAlerts.keptAsPlanned'),
          body: '',
        },
      ],
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed to schedule the acknowledgement`, error);
  }
}

export async function keepWeatherPlanFromPush(
  actionId: string,
  data: WeatherPushActionData,
): Promise<boolean> {
  const actionToken = resolveWeatherKeepToken(actionId, data);
  if (!actionToken) {
    return false;
  }

  try {
    await api.post('/push/invite-action', { actionToken });
  } catch (error) {
    // Expired token, offline, game already moved — the banner in the app is
    // still there and still offers the same choice.
    console.warn(`${LOG_PREFIX} keep-as-planned failed`, error);
    return false;
  }

  await scheduleAcknowledgement();

  const gameId = data.data?.gameId;
  if (gameId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.weatherAlerts.game(gameId) });
  }
  return true;
}
