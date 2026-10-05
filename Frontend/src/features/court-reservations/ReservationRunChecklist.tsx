/**
 * The run, as a checklist. Every step is on screen from the first frame
 * (waiting = hollow ring); the current one spins; finished ones tick with a
 * small pop. A failure shows inline, under its step, with "Try again" when
 * the run can resume. Follow-ups for the club close the list.
 *
 * Motion is CSS (`courtReservations.css`), so nothing waits on JS animation
 * frames, and reduced motion simply swaps icons.
 */
import { Circle, LoaderCircle, Minus, Phone, RotateCw, Undo2 } from 'lucide-react';
import { ClubFollowUpRow } from './ClubFollowUpRow';
import { clubFollowUpsFromRun } from './clubFollowUps';
import type { CourtRef } from './courtReservationsModel';
import type { RunJournal, RunStepRecord, RunStepStatus } from './reservationRunner';
import { stepLabel, stepStatusLabel, visibleRunSteps } from './rescheduleCopy';
import type { CourtReservationText } from './useCourtReservationText';
import './courtReservations.css';

function StatusIcon({ status }: { status: RunStepStatus }) {
  switch (status) {
    case 'pending':
      return <Circle size={20} strokeWidth={1.75} className="text-gray-300 dark:text-gray-600" />;
    case 'running':
      return <LoaderCircle size={20} className="animate-spin text-primary-600 motion-reduce:animate-none dark:text-primary-400" />;
    case 'done':
      return (
        <span className="cr-pop flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white dark:bg-emerald-400 dark:text-emerald-950">
          <svg viewBox="0 0 12 12" width={12} height={12} className="cr-tick" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.3 5 8.6 9.5 3.6" />
          </svg>
        </span>
      );
    case 'failed':
      return (
        <span className="cr-pop flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[13px] font-bold leading-none text-white">
          !
        </span>
      );
    case 'follow_up':
    case 'left_at_club':
      return <Phone size={17} className="text-amber-600 dark:text-amber-400" />;
    case 'rolled_back':
      return <Undo2 size={17} className="text-gray-500 dark:text-gray-400" />;
    case 'skipped':
      return <Minus size={17} className="text-gray-300 dark:text-gray-600" />;
  }
}

function failureHint(record: RunStepRecord, text: CourtReservationText): string {
  switch (record.step.kind) {
    case 'book':
      return text.t('run.failedHint.book');
    case 'save_game':
      return text.t('run.failedHint.save');
    default:
      return text.t('run.failedHint.other');
  }
}

export function ReservationRunChecklist({
  journal,
  courtsById,
  text,
  linkTimes,
  playerCount,
  onRetry,
  retryBusy = false,
}: {
  journal: RunJournal;
  courtsById: Readonly<Record<string, CourtRef>>;
  text: CourtReservationText;
  /** Old reservation times by provider booking id (for "Cancel the old 18:00–19:30 reservation"). */
  linkTimes?: Readonly<Record<string, { start?: string | null; end?: string | null; courtId?: string | null }>>;
  /** Players told about the new time (save step label). */
  playerCount?: number;
  /** Resume a paused run from the failed step (shown inline under it). */
  onRetry?: () => void;
  retryBusy?: boolean;
}) {
  const records = visibleRunSteps(journal);
  // A follow-up that is already a line in the list ("Tell the club: …") is not repeated below it.
  const listed = new Set(records.map((r) => `run:${r.key}`));
  const followUps = clubFollowUpsFromRun(journal, linkTimes).filter((f) => !listed.has(f.id));
  const labelCtx = { steps: journal.steps.map((r) => r.step), playerCount, linkTimes };
  const current = records.find((r) => r.status === 'running') ?? records.find((r) => r.status === 'failed');
  const canRetry = Boolean(onRetry) && journal.phase === 'paused';

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {current ? `${stepStatusLabel(current.status, text)}: ${stepLabel(current.step, courtsById, text, labelCtx)}` : ''}
      </p>
      <ol className="flex flex-col">
        {records.map((record, i) => {
          const muted = record.status === 'skipped' || record.status === 'pending' || record.status === 'rolled_back';
          const failed = record.status === 'failed';
          const last = i === records.length - 1;
          return (
            <li key={record.key} className="relative flex gap-3 px-1" data-step-status={record.status}>
              {/* Rail: a quiet line joining the step icons. */}
              {!last ? (
                <span
                  aria-hidden
                  className={`absolute start-[13px] top-[34px] bottom-[-6px] w-px ${
                    record.status === 'done' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ) : null}
              <span className="relative flex h-11 w-5 shrink-0 items-center justify-center" aria-hidden>
                <span key={record.status} className="flex items-center justify-center">
                  <StatusIcon status={record.status} />
                </span>
              </span>
              <div className="min-w-0 flex-1 py-2.5">
                <p
                  className={`text-sm leading-snug transition-colors duration-200 ${
                    muted ? 'text-gray-500 dark:text-gray-400' : failed ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'
                  } ${record.status === 'running' ? 'font-medium' : ''}`}
                >
                  {stepLabel(record.step, courtsById, text, labelCtx)}
                  <span className="sr-only">{` — ${stepStatusLabel(record.status, text)}`}</span>
                </p>
                {record.status === 'left_at_club' || record.status === 'rolled_back' || record.status === 'follow_up' ? (
                  <p aria-hidden className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {stepStatusLabel(record.status, text)}
                  </p>
                ) : null}
                {failed ? (
                  <div className="cr-enter mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-red-700 dark:text-red-300">{failureHint(record, text)}</span>
                    {canRetry ? (
                      <button
                        type="button"
                        onClick={onRetry}
                        disabled={retryBusy}
                        className="-my-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <RotateCw size={13} aria-hidden />
                        {text.t('run.retry')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {followUps.length > 0 ? (
        <section className="cr-enter mt-4">
          <h4 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {text.t('followUp.title')}
          </h4>
          <ul className="flex flex-col gap-1.5">
            {followUps.map((f) => (
              <ClubFollowUpRow key={f.id} followUp={f} text={text} courtsById={courtsById} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
