import type { ReactNode } from 'react';
import { ArrowRight, Check, Loader2, Trash2 } from 'lucide-react';
import { EASE_CLASS, SOFT_CONTROL_CLASS } from './scoreEntryStyles';

interface ScoreEntryFooterProps {
  cancelLabel: string;
  saveLabel: string;
  deleteLabel: string;
  saveDisabled: boolean;
  canRemove: boolean;
  onCancel: () => void;
  onSave: () => void;
  onRemove?: () => void;
  /** When set, a primary "Save and next" button follows Save; Cancel gives way to the dialog's close button. */
  saveAndNextLabel?: string;
  saveAndNextDisabled?: boolean;
  onSaveAndNext?: () => void;
  /** Waiting for this save to land before the next set of the same match opens. */
  isAdvancing?: boolean;
}

const PILL = `group inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-full transition-[transform,background-color,opacity] duration-300 ${EASE_CLASS} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900`;

const PRIMARY_PILL = `${PILL} bg-primary-600 ps-4 pe-2 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_22px_-12px_rgba(15,23,42,0.55)] hover:bg-primary-700`;

const SECONDARY_PILL = `${PILL} px-3.5 font-semibold text-gray-900 dark:text-white ${SOFT_CONTROL_CLASS}`;

/** Trailing icon in its own disc, flush with the pill's inner edge. */
const IconDisc = ({ children }: { children: ReactNode }) => (
  <span
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.18] transition-transform duration-500 ${EASE_CLASS} group-hover:translate-x-0.5 group-active:scale-95 rtl:group-hover:-translate-x-0.5`}
    aria-hidden
  >
    {children}
  </span>
);

export const ScoreEntryFooter = ({
  cancelLabel,
  saveLabel,
  deleteLabel,
  saveDisabled,
  canRemove,
  onCancel,
  onSave,
  onRemove,
  saveAndNextLabel,
  saveAndNextDisabled = false,
  onSaveAndNext,
  isAdvancing = false,
}: ScoreEntryFooterProps) => {
  const withNext = Boolean(onSaveAndNext && saveAndNextLabel);

  return (
    <div className="relative flex shrink-0 items-center gap-2 px-4 pb-3.5 pt-3">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-gray-900/[0.08] to-transparent dark:via-white/[0.08]"
      />
      {withNext ? null : (
        <button
          type="button"
          onClick={onCancel}
          className={`${PILL} flex-1 px-4 text-[15px] font-medium text-gray-600 hover:bg-gray-900/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.05]`}
        >
          {cancelLabel}
        </button>
      )}
      {canRemove && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={isAdvancing}
          aria-label={deleteLabel}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-500/[0.08] text-red-600 transition-[transform,background-color,opacity] duration-300 ${EASE_CLASS} hover:bg-red-500/[0.14] active:scale-90 disabled:opacity-40 dark:bg-red-500/[0.12] dark:text-red-400 dark:hover:bg-red-500/[0.18]`}
        >
          <Trash2 size={18} strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
      {withNext ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled || isAdvancing}
          className={`${SECONDARY_PILL} max-w-[40%] shrink-0 text-[13px]`}
        >
          <span className="truncate">{saveLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled || isAdvancing}
          className={`${PRIMARY_PILL} flex-[1.4] text-[15px]`}
        >
          <span className="min-w-0 flex-1 truncate text-center">{saveLabel}</span>
          <IconDisc>
            <Check size={16} strokeWidth={2} />
          </IconDisc>
        </button>
      )}
      {withNext ? (
        <button
          type="button"
          onClick={onSaveAndNext}
          disabled={saveAndNextDisabled || isAdvancing}
          className={`${PRIMARY_PILL} flex-1 text-[13px]`}
        >
          {/* Long translations balance onto two lines instead of truncating. */}
          <span className="line-clamp-2 min-w-0 flex-1 text-center leading-[1.15] text-balance [overflow-wrap:anywhere]">
            {saveAndNextLabel}
          </span>
          <IconDisc>
            {isAdvancing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowRight size={16} strokeWidth={2} className="rtl:-scale-x-100" />
            )}
          </IconDisc>
        </button>
      ) : null}
    </div>
  );
};
