import { ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components';

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
    <div className="flex shrink-0 items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
      {withNext ? null : (
        <Button onClick={onCancel} variant="ghost" className="h-11 flex-1 rounded-xl text-sm font-medium">
          {cancelLabel}
        </Button>
      )}
      {canRemove && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={isAdvancing}
          aria-label={deleteLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 active:scale-95 disabled:opacity-40 dark:hover:bg-red-950/30"
        >
          <Trash2 size={17} />
        </button>
      ) : null}
      <Button
        onClick={onSave}
        disabled={saveDisabled || isAdvancing}
        variant={withNext ? 'outline' : 'primary'}
        className={`h-11 rounded-xl text-sm font-semibold ${withNext ? 'flex-1' : 'flex-[1.4]'}`}
      >
        {saveLabel}
      </Button>
      {withNext ? (
        <Button
          onClick={onSaveAndNext}
          disabled={saveAndNextDisabled || isAdvancing}
          className="h-11 flex-[1.5] gap-1.5 rounded-xl text-sm font-semibold"
        >
          {isAdvancing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          <span className="truncate">{saveAndNextLabel}</span>
          {isAdvancing ? null : <ArrowRight size={16} aria-hidden />}
        </Button>
      ) : null}
    </div>
  );
};
