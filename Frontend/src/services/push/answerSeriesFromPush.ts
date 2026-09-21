/**
 * PRD 345 — answering "Same time next week?" from a push shade action.
 *
 * `accept` seats the player on the next occurrence, `decline` records nothing
 * and lets the seat open at the deadline. Both post a signed action token to the
 * unauthenticated push-action endpoint and neither opens the app: the whole
 * point of the prompt is that keeping a seat costs one tap.
 *
 * Deliberately shares `PUSH_ACTION_ACCEPT` / `PUSH_ACTION_DECLINE` with the
 * invite pair — the dispatcher tells them apart by `data.type`.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from '@/i18n/config';
import api from '@/api/axios';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import { PUSH_ACTION_ACCEPT, PUSH_ACTION_DECLINE } from './pushNotificationConstants';

const LOG_PREFIX = '[series-push]';

export const SERIES_PUSH_TYPE = 'GAME_SERIES_NEXT_PROMPT';

export interface SeriesPushActionData {
  type: string;
  data?: {
    gameId?: string;
    seriesId?: string;
    acceptActionToken?: string;
    declineActionToken?: string;
  };
}

/** The signed token for this action, or `null` when the push does not carry one. */
export function resolveSeriesActionToken(
  actionId: string,
  data: SeriesPushActionData,
): string | null {
  if (data.type !== SERIES_PUSH_TYPE) {
    return null;
  }
  const token =
    actionId === PUSH_ACTION_ACCEPT
      ? data.data?.acceptActionToken
      : actionId === PUSH_ACTION_DECLINE
        ? data.data?.declineActionToken
        : undefined;
  return token?.trim() ? token : null;
}

export function seriesAcknowledgementKey(actionId: string): string {
  return actionId === PUSH_ACTION_ACCEPT ? 'series.seatKept' : 'series.skipped';
}

async function scheduleAcknowledgement(actionId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2_147_483_647),
          title: i18n.t(seriesAcknowledgementKey(actionId)),
          body: '',
        },
      ],
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed to schedule the acknowledgement`, error);
  }
}

export async function answerSeriesFromPush(
  actionId: string,
  data: SeriesPushActionData,
): Promise<boolean> {
  const actionToken = resolveSeriesActionToken(actionId, data);
  if (!actionToken) {
    return false;
  }

  try {
    await api.post('/push/invite-action', { actionToken });
  } catch (error) {
    // Expired token, offline, seat already taken — all the same to the player:
    // the answer did not land, and the in-app card is still there to tap.
    console.warn(`${LOG_PREFIX} answer failed`, error);
    return false;
  }

  await scheduleAcknowledgement(actionId);

  const gameId = data.data?.gameId;
  if (gameId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.series.nextPrompt(gameId) });
  }
  const seriesId = data.data?.seriesId;
  if (seriesId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(seriesId) });
  }
  return true;
}
