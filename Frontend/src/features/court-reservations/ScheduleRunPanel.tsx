/**
 * The club changes of a saved time move, as they run (inside the "When and
 * where" editor): every step on screen at once, ticking as the runner (owned
 * by the game page: `run` + callbacks) moves; a failure shows inline with
 * retry. If another change is already running for this game, nothing runs:
 * the panel says so and offers "Finish it" (ours) or asks to wait.
 *
 * Body and footer are separate so the editor can keep its sticky footer.
 */
import { Hourglass } from 'lucide-react';
import { pressScaleGuard } from '@/components/motion/pressScale';
import type { CourtRef } from './courtReservationsModel';
import { isAutomaticStep } from './rescheduleChoices';
import { visibleRunSteps } from './rescheduleCopy';
import { ReservationRunChecklist } from './ReservationRunChecklist';
import { activeRunOf, isBlockedByOtherRun, type RunJournal } from './reservationRunner';
import type { CourtReservationText } from './useCourtReservationText';
import './courtReservations.css';

type LinkTimes = Record<string, { start?: string | null; end?: string | null; courtId?: string | null }>;

export function ScheduleRunBody({
  run,
  courtsById,
  text,
  linkTimes,
  playerCount,
  currentUserId,
  canResumeOther,
  onRetry,
  busy,
}: {
  run: RunJournal;
  courtsById: Readonly<Record<string, CourtRef>>;
  text: CourtReservationText;
  linkTimes: LinkTimes;
  playerCount: number;
  currentUserId: string | null;
  canResumeOther: boolean;
  onRetry?: () => void;
  busy: boolean;
}) {
  const { t } = text;
  if (isBlockedByOtherRun(run)) {
    const active = activeRunOf(run);
    const ours = Boolean(active?.createdById && currentUserId && active.createdById === currentUserId);
    return (
      <div className="cr-enter flex items-start gap-3 rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/40" data-testid="other-run-notice">
        <Hourglass size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
        <p className="text-sm leading-snug text-amber-950 dark:text-amber-50">
          {ours && canResumeOther ? t('run.otherRun.ours') : t('run.otherRun.someoneElse')}
        </p>
      </div>
    );
  }
  return (
    <div className="cr-fade" data-testid="schedule-run">
      <ReservationRunChecklist
        journal={run}
        courtsById={courtsById}
        text={text}
        linkTimes={linkTimes}
        playerCount={playerCount}
        onRetry={onRetry}
        retryBusy={busy}
      />
    </div>
  );
}

export function ScheduleRunFooter({
  run,
  text,
  busy,
  currentUserId,
  onRetry,
  onDismiss,
  onClose,
  onResumeOther,
}: {
  run: RunJournal;
  text: CourtReservationText;
  busy: boolean;
  currentUserId: string | null;
  onRetry?: () => void;
  /** Leave the run view (rolled back → back to editing; done → close). */
  onDismiss: () => void;
  onClose: () => void;
  onResumeOther?: () => void;
}) {
  const { t } = text;
  const secondaryBtn =
    'min-h-[52px] flex-1 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:text-white dark:hover:bg-gray-700/50';
  const primaryBtn = `flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-primary-600 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60 enabled:active:scale-[0.98] dark:focus-visible:ring-offset-gray-800 ${pressScaleGuard}`;

  if (isBlockedByOtherRun(run)) {
    const active = activeRunOf(run);
    const ours = Boolean(active?.createdById && currentUserId && active.createdById === currentUserId);
    return ours && onResumeOther ? (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onDismiss();
            onClose();
          }}
          className={secondaryBtn}
        >
          {t('run.later')}
        </button>
        <button type="button" disabled={busy} onClick={onResumeOther} className={`${primaryBtn} flex-[2]`}>
          {t('run.otherRun.finishIt')}
        </button>
      </div>
    ) : (
      <button type="button" onClick={onDismiss} className={primaryBtn}>
        {t('run.backToPlan')}
      </button>
    );
  }
  if (run.phase === 'running') {
    const shown = visibleRunSteps(run).filter((r) => isAutomaticStep(r.step));
    const total = shown.length;
    const done = shown.filter((r) => r.status !== 'pending' && r.status !== 'running').length;
    return (
      <button type="button" disabled aria-live="polite" className={`${primaryBtn} gap-2`}>
        <span>{t('run.working')}</span>
        {total > 1 ? (
          <span className="font-normal tabular-nums opacity-80">{t('run.progress', { done: Math.min(done + 1, total), total })}</span>
        ) : null}
      </button>
    );
  }
  if (run.phase === 'paused') {
    return (
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className={secondaryBtn}>
          {t('run.later')}
        </button>
        <button type="button" disabled={busy} onClick={onRetry} className={`${primaryBtn} flex-[2]`}>
          {t('run.retry')}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        onDismiss();
        if (run.phase === 'done') onClose();
      }}
      className={primaryBtn}
    >
      {run.phase === 'done' ? t('run.close') : t('run.backToPlan')}
    </button>
  );
}
