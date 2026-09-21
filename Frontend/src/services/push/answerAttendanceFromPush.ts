/**
 * PRD 346 — answering the reminder from a push shade action.
 *
 * Confirmation is a courtesy signal: this posts a signed action token and
 * nothing else. It never opens the app, never touches a seat or a queue
 * position, and a failure is silent — there is no deadline to miss.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from '@/i18n/config';
import { attendanceApi } from '@/api/attendance';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import {
  PUSH_ACTION_ATTENDANCE_CONFIRM,
  PUSH_ACTION_ATTENDANCE_UNSURE,
} from './pushNotificationConstants';

const LOG_PREFIX = '[attendance-push]';

export interface AttendancePushActionData {
  type: string;
  data?: {
    gameId?: string;
    attendanceActionToken?: string;
    attendanceUnsureActionToken?: string;
  };
}

/** The signed token for this action, or `null` when the push does not carry one. */
export function resolveAttendanceActionToken(
  actionId: string,
  data: AttendancePushActionData,
): string | null {
  if (data.type !== 'GAME_REMINDER') {
    return null;
  }
  const token =
    actionId === PUSH_ACTION_ATTENDANCE_CONFIRM
      ? data.data?.attendanceActionToken
      : actionId === PUSH_ACTION_ATTENDANCE_UNSURE
        ? data.data?.attendanceUnsureActionToken
        : undefined;
  return token?.trim() ? token : null;
}

export function attendanceAcknowledgementKey(actionId: string): string {
  return actionId === PUSH_ACTION_ATTENDANCE_CONFIRM
    ? 'attendance.confirmedToast'
    : 'attendance.unsureToast';
}

async function scheduleAcknowledgement(actionId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2_147_483_647),
          title: i18n.t(attendanceAcknowledgementKey(actionId)),
          body: '',
        },
      ],
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed to schedule the acknowledgement`, error);
  }
}

export async function answerAttendanceFromPush(
  actionId: string,
  data: AttendancePushActionData,
): Promise<boolean> {
  const actionToken = resolveAttendanceActionToken(actionId, data);
  if (!actionToken) {
    return false;
  }

  try {
    await attendanceApi.answerFromPushToken(actionToken);
  } catch (error) {
    // Stale token, offline, server trouble — all the same to the player: the
    // answer simply did not land and the reminder can be answered again.
    console.warn(`${LOG_PREFIX} answer failed`, error);
    return false;
  }

  await scheduleAcknowledgement(actionId);

  const gameId = data.data?.gameId;
  if (gameId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.game(gameId) });
  }
  return true;
}
