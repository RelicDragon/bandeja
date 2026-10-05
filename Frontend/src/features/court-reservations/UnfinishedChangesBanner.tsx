/**
 * "Your court changes didn't finish" — shown when a run journal (this device,
 * or the server's active run) was left `running` or `paused`, e.g. the app
 * was killed mid-way. One primary action, "Finish changes"; "Undo" only while
 * the game has not been saved yet (bookings made so far are cancelled).
 */
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { isSaveDone, type RunJournal } from './reservationRunner';
import { useCourtReservationText } from './useCourtReservationText';
import './courtReservations.css';

export type UnfinishedChangesBannerProps = {
  journal: RunJournal;
  timeZone: string;
  busy?: boolean;
  onFinish: () => void;
  onUndo?: () => void;
  className?: string;
};

export function UnfinishedChangesBanner({ journal, timeZone, busy = false, onFinish, onUndo, className }: UnfinishedChangesBannerProps) {
  const { t, clock } = useCourtReservationText(timeZone);
  const saved = isSaveDone(journal);
  const remaining = journal.steps.filter((s) => s.status === 'pending' || s.status === 'running' || s.status === 'failed').length;
  const target = journal.targetWindow;

  return (
    <div
      role="status"
      className={`cr-enter rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40 ${className ?? ''}`}
      data-testid="unfinished-changes-banner"
    >
      <div className="flex items-start gap-3">
        <RotateCcw size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
            {saved ? t('banner.pausedTitle') : t('banner.unfinishedTitle')}
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-100/80">
            {target
              ? t('banner.detail', { count: remaining, time: clock.range(target.start, target.end) })
              : t('banner.detailNoTime', { count: remaining })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {onUndo && !saved ? (
          <button
            type="button"
            disabled={busy}
            onClick={onUndo}
            className="min-h-[44px] flex-1 rounded-xl px-3 text-sm font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            {t('banner.undo')}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={onFinish}
          className={`flex min-h-[44px] flex-[2] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-70 enabled:active:scale-[0.98] ${pressScaleGuard}`}
        >
          {busy ? <LoaderCircle size={16} aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
          {t('banner.finish')}
        </button>
      </div>
    </div>
  );
}
