/**
 * PRD 346 — the attendance card under the game header.
 *
 * **Product principle.** Answering is a courtesy signal, never a contract. The
 * caption under the buttons says so in words, and it is required copy: nothing
 * on this card can cost a player their seat. The only way out of a game is the
 * normal leave flow, reached through the "Can't make it at all?" link.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { CheckCircle2, HelpCircle } from 'lucide-react';
import { Card } from '@/components';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useNetworkStore } from '@/utils/networkStatus';
import type { AttendanceAnswer } from '@/api/attendance';
import type { BasicUser } from '@/types';
import { AttendanceNoShowPanel } from './AttendanceNoShowPanel';
import { AttendanceOrganizerStrip } from './AttendanceOrganizerStrip';
import { attendanceErrorKey } from './attendanceVisuals';
import type { UseGameAttendanceResult } from './useGameAttendance';

export interface AttendanceCardProps {
  attendance: UseGameAttendanceResult;
  /** The viewer is a PLAYING participant and may answer. */
  canAnswer: boolean;
  /** The viewer is the owner or an admin and sees the strip. */
  isOrganizer: boolean;
  /** PLAYING participants, for the organizer's after-the-game no-show list. */
  players: { userId: string; user: BasicUser }[];
  viewerUserId: string | undefined;
  /** Opens the existing leave-game confirmation. */
  onRequestLeave: () => void;
}

function apiErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { code?: string; message?: string } } })?.response
    ?.data;
  if (!data || typeof data !== 'object') return undefined;
  return data.code ?? data.message;
}

export function AttendanceCard({
  attendance,
  canAnswer,
  isOrganizer,
  players,
  viewerUserId,
  onRequestLeave,
}: AttendanceCardProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const isOnline = useNetworkStore((state) => state.isOnline);
  const [isChanging, setIsChanging] = useState(false);

  const details = attendance.details;
  const viewerAttendance = attendance.viewerAttendance;
  const hasAnswered = viewerAttendance === 'CONFIRMED' || viewerAttendance === 'UNSURE';
  const showButtons = canAnswer && (!hasAnswered || isChanging);

  const handleAnswer = useCallback(
    async (state: AttendanceAnswer) => {
      try {
        await attendance.answer(state);
        setIsChanging(false);
        toast.success(
          state === 'CONFIRMED' ? t('attendance.confirmedToast') : t('attendance.unsureToast'),
        );
      } catch (error) {
        toast.error(t(attendanceErrorKey(apiErrorCode(error))));
      }
    },
    [attendance, t],
  );

  const handleNudge = useCallback(async () => {
    try {
      await attendance.nudge();
      toast.success(t('attendance.organizer.nudgeSent'));
    } catch (error) {
      toast.error(t(attendanceErrorKey(apiErrorCode(error))));
    }
  }, [attendance, t]);

  if (!details) return null;
  const showAsk = details.answersOpen && canAnswer;
  const showStrip = details.answersOpen && isOrganizer;
  const showNoShowPanel = details.noShowWindowOpen && isOrganizer;
  if (!showAsk && !showStrip && !showNoShowPanel) return null;

  const transition = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' as const };

  return (
    <Card className="p-3 sm:p-4">
      {showAsk ? (
        <AnimatePresence initial={false} mode="wait">
          {showButtons ? (
            <motion.div
              key="attendance-ask"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={transition}
              className="overflow-hidden"
            >
              <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                {t('attendance.question')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleAnswer('CONFIRMED')}
                  disabled={attendance.isAnswering}
                  aria-busy={attendance.isAnswering}
                  className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors enabled:active:scale-[0.98] ${pressScaleGuard} ${
                    attendance.isAnswering
                      ? // Pending / offline: outlined and dashed, never a blocking spinner.
                        'border-2 border-dashed border-primary-400 text-primary-600 dark:text-primary-300'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  <CheckCircle2 size={16} aria-hidden />
                  {attendance.isAnswering ? t('attendance.saving') : t('attendance.confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleAnswer('UNSURE')}
                  disabled={attendance.isAnswering}
                  className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border-2 border-primary-600 px-3 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 disabled:opacity-60 enabled:active:scale-[0.98] dark:border-primary-500 dark:text-primary-400 dark:hover:bg-primary-950/40 ${pressScaleGuard}`}
                >
                  <HelpCircle size={16} aria-hidden />
                  {t('attendance.unsure')}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="attendance-answered"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={transition}
              className="flex items-center gap-2 overflow-hidden"
            >
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  viewerAttendance === 'CONFIRMED'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
                aria-hidden
              >
                {viewerAttendance === 'CONFIRMED' ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <HelpCircle size={14} />
                )}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                {viewerAttendance === 'CONFIRMED'
                  ? t('attendance.confirmedState')
                  : t('attendance.unsureState')}
              </p>
              <button
                type="button"
                onClick={() => setIsChanging(true)}
                className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
              >
                {t('attendance.change')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      ) : null}

      {showAsk ? (
        <>
          <p className="mt-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            {t('attendance.caption')}
          </p>
          {!isOnline ? (
            <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
              {t('attendance.queuedOffline')}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onRequestLeave}
            className="mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
          >
            {t('attendance.cantMakeIt')}
          </button>
        </>
      ) : null}

      {showStrip ? (
        <AttendanceOrganizerStrip
          confirmedCount={details.confirmedCount}
          playingCount={details.playingCount}
          nudgeAllowed={details.nudge.allowed}
          nudgeRemainingHours={details.nudge.remainingHours}
          isNudging={attendance.isNudging}
          onNudge={() => void handleNudge()}
        />
      ) : null}

      {showNoShowPanel ? (
        <AttendanceNoShowPanel
          attendance={attendance}
          players={players}
          viewerUserId={viewerUserId}
        />
      ) : null}
    </Card>
  );
}
