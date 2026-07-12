import { Trash2 } from 'lucide-react';
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
}: ScoreEntryFooterProps) => (
  <div className="flex shrink-0 items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
    <Button onClick={onCancel} variant="ghost" className="h-11 flex-1 rounded-xl text-sm font-medium">
      {cancelLabel}
    </Button>
    {canRemove && onRemove ? (
      <button
        type="button"
        onClick={onRemove}
        aria-label={deleteLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-red-500 hover:bg-red-50 active:scale-95 dark:hover:bg-red-950/30"
      >
        <Trash2 size={17} />
      </button>
    ) : null}
    <Button
      onClick={onSave}
      disabled={saveDisabled}
      className="h-11 flex-[1.4] rounded-xl text-sm font-semibold"
    >
      {saveLabel}
    </Button>
  </div>
);
