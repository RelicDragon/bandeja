/**
 * PRD 346 — the organizer's after-the-game roster for no-show notes.
 *
 * Shown to the owner/admin for seven days after the game ends, whatever the
 * results state. A note is neutral: grey tag, neutral confirm dialog, a
 * "Noted · Undo" toast, and a friendly heads-up for the player. It never
 * removes anyone, never changes a seat and never touches a rating.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { PlayerAvatar } from '@/components';
import { PremiumName } from '@/components/PremiumName';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import type { BasicUser } from '@/types';
import { AttendanceDot } from './AttendanceDot';
import { AttendanceRosterActions } from './AttendanceRosterActions';
import { attendanceErrorKey, resolveDotState } from './attendanceVisuals';
import type { UseGameAttendanceResult } from './useGameAttendance';

export interface AttendanceNoShowPanelProps {
  attendance: UseGameAttendanceResult;
  /** PLAYING participants of the game, in roster order. */
  players: { userId: string; user: BasicUser }[];
  viewerUserId: string | undefined;
}

function apiErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { code?: string; message?: string } } })?.response
    ?.data;
  if (!data || typeof data !== 'object') return undefined;
  return data.code ?? data.message;
}

function displayName(user: BasicUser): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}

export function AttendanceNoShowPanel({
  attendance,
  players,
  viewerUserId,
}: AttendanceNoShowPanelProps) {
  const { t } = useTranslation();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const details = attendance.details;
  const pendingPlayer = useMemo(
    () => players.find((player) => player.userId === pendingUserId) ?? null,
    [players, pendingUserId],
  );

  const handleUndo = useCallback(
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

  const handleConfirmNote = useCallback(async () => {
    if (!pendingUserId) return;
    const userId = pendingUserId;
    setPendingUserId(null);
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
                void handleUndo(userId);
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
  }, [attendance, pendingUserId, t, handleUndo]);

  if (!details?.noShowWindowOpen || players.length === 0) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        {t('attendance.legend.hint')}
      </p>
      <ul className="space-y-1">
        {players.map((player) => {
          const state = resolveDotState(
            attendance.attendanceOf(player.userId),
            attendance.noShowNotedAt(player.userId),
          );
          return (
            <li
              key={player.userId}
              className="flex items-center gap-3 rounded-xl bg-gray-50/90 p-2 dark:bg-gray-800/70"
            >
              <div className="relative shrink-0">
                <PlayerAvatar player={player.user} extrasmall showName={false} fullHideName />
                <AttendanceDot state={state} size="md" />
              </div>
              <p className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-white">
                {player.userId === viewerUserId ? (
                  t('attendance.youOrganizer')
                ) : (
                  <PremiumName user={player.user}>{displayName(player.user)}</PremiumName>
                )}
              </p>
              <AttendanceRosterActions
                state={state}
                canNote={player.userId !== viewerUserId}
                onNote={() => setPendingUserId(player.userId)}
                onUndo={() => void handleUndo(player.userId)}
              />
            </li>
          );
        })}
      </ul>

      <ConfirmationModal
        isOpen={Boolean(pendingPlayer)}
        tone="info"
        confirmVariant="primary"
        title={t('attendance.noShow.dialogTitle', {
          name: pendingPlayer ? displayName(pendingPlayer.user) : '',
        })}
        message={t('attendance.noShow.dialogBody')}
        confirmText={t('attendance.noShow.confirm')}
        cancelText={t('attendance.noShow.cancel')}
        onConfirm={() => void handleConfirmNote()}
        onClose={() => setPendingUserId(null)}
      />
    </div>
  );
}
