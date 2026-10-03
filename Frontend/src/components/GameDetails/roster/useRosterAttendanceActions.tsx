import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { AttendanceAnswer } from '@/api/attendance';
import { attendanceErrorKey } from '@/features/attendance/attendanceVisuals';
import type { UseGameAttendanceResult } from '@/features/attendance/useGameAttendance';

/**
 * PRD 346 — attendance actions for the unified roster, with their toasts.
 *
 * Answering is a courtesy signal, never a contract: nothing here can change a
 * seat. A no-show note is neutral (grey, undoable for seven days) and only an
 * organizer can write one, after a confirmation.
 */

function apiErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { code?: string; message?: string } } })?.response
    ?.data;
  if (!data || typeof data !== 'object') return undefined;
  return data.code ?? data.message;
}

export function useRosterAttendanceActions(attendance: UseGameAttendanceResult) {
  const { t } = useTranslation();
  const [pendingNoShowUserId, setPendingNoShowUserId] = useState<string | null>(null);

  const answer = useCallback(
    async (state: AttendanceAnswer) => {
      try {
        await attendance.answer(state);
        toast.success(
          state === 'CONFIRMED' ? t('attendance.confirmedToast') : t('attendance.unsureToast'),
        );
        return true;
      } catch (error) {
        toast.error(t(attendanceErrorKey(apiErrorCode(error))));
        return false;
      }
    },
    [attendance, t],
  );

  const nudge = useCallback(async () => {
    try {
      await attendance.nudge();
      toast.success(t('attendance.organizer.nudgeSent'));
    } catch (error) {
      toast.error(t(attendanceErrorKey(apiErrorCode(error))));
    }
  }, [attendance, t]);

  const undoNoShow = useCallback(
    async (userId: string) => {
      try {
        await attendance.undoNoShow(userId);
        toast.success(t('attendance.noShow.undone'));
      } catch (error) {
        toast.error(t(attendanceErrorKey(apiErrorCode(error))));
      }
    },
    [attendance, t],
  );

  const confirmNoShow = useCallback(async () => {
    if (!pendingNoShowUserId) return;
    const userId = pendingNoShowUserId;
    setPendingNoShowUserId(null);
    try {
      await attendance.noteNoShow(userId);
      toast.success(
        (instance) => (
          <span className="flex items-center gap-3">
            {t('attendance.noShow.noted')}
            <button
              type="button"
              onClick={() => {
                toast.dismiss(instance.id);
                void undoNoShow(userId);
              }}
              className="min-h-[44px] font-semibold text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
            >
              {t('attendance.noShow.undo')}
            </button>
          </span>
        ),
        { duration: 8000 },
      );
    } catch (error) {
      toast.error(t(attendanceErrorKey(apiErrorCode(error))));
    }
  }, [attendance, pendingNoShowUserId, t, undoNoShow]);

  return {
    answer,
    nudge,
    undoNoShow,
    requestNoShow: setPendingNoShowUserId,
    pendingNoShowUserId,
    cancelNoShow: () => setPendingNoShowUserId(null),
    confirmNoShow,
  };
}
