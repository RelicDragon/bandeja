import { Pencil, X } from 'lucide-react';

interface MatchHeaderEditToggleButtonProps {
  isEditing: boolean;
  editLabel: string;
  cancelLabel: string;
  onEditClick: () => void;
  onCancelClick: () => void;
}

export const MatchHeaderEditToggleButton = ({
  isEditing,
  editLabel,
  cancelLabel,
  onEditClick,
  onCancelClick,
}: MatchHeaderEditToggleButtonProps) => (
  <button
    type="button"
    aria-label={isEditing ? cancelLabel : editLabel}
    title={isEditing ? cancelLabel : editLabel}
    className={`relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white shadow transition-[border-color,background-color,color,box-shadow] duration-200 ease-out hover:shadow-md dark:bg-gray-800 ${
      isEditing
        ? 'border-slate-500 text-slate-600 hover:border-slate-600 hover:text-slate-700 dark:border-slate-400 dark:text-slate-300 dark:hover:border-slate-300 dark:hover:text-slate-200'
        : 'border-blue-500 text-blue-500 hover:border-blue-600 hover:text-blue-600'
    }`}
    onClick={(e) => {
      e.stopPropagation();
      if (isEditing) {
        onCancelClick();
      } else {
        onEditClick();
      }
    }}
  >
    <span className="relative flex h-full w-full items-center justify-center">
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
          isEditing ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
        }`}
        aria-hidden
      >
        <Pencil size={12} strokeWidth={2} />
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
          isEditing ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0'
        }`}
        aria-hidden
      >
        <X size={12} strokeWidth={2} />
      </span>
    </span>
  </button>
);
