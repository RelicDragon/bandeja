import {
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ElementType,
  type TextareaHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2 } from 'lucide-react';
import { FullscreenTextEditor, type TextSelectionRange } from '@/components/ui/FullscreenTextEditor';

/** Room reserved on the trailing side of the first line for the expand control. */
const EXPAND_BUTTON_INSET = '2.75rem';

export interface ExpandableTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Header title of the fullscreen editor — pass the field label. */
  fullscreenTitle: string;
  /** Classes for the positioning wrapper; `className` still goes to the textarea. */
  wrapperClassName?: string;
  /** Drop-in replacement for `<textarea>` (e.g. `SelectionPreservingTextarea`). */
  textareaComponent?: ElementType;
}

/**
 * Textarea with a fullscreen-editor control pinned to its top trailing corner.
 * The overlay edits the same value live, so closing it never discards text.
 */
export const ExpandableTextarea = ({
  value,
  onValueChange,
  fullscreenTitle,
  wrapperClassName,
  textareaComponent,
  className,
  style,
  disabled,
  readOnly,
  maxLength,
  placeholder,
  ...textareaProps
}: ExpandableTextareaProps) => {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const inlineRef = useRef<HTMLTextAreaElement | null>(null);
  const modalId = `expandable-textarea-${useId()}`;
  const Field: ElementType = textareaComponent ?? 'textarea';
  const canExpand = !disabled && !readOnly;

  const getInitialSelection = useCallback((): TextSelectionRange | null => {
    const el = inlineRef.current;
    return el ? { start: el.selectionStart, end: el.selectionEnd } : null;
  }, []);

  /* Radix restores focus to the inline field after the overlay closes, so the
     caret has to be written back on the next frame to survive that focus. */
  const restoreSelection = useCallback((selection: TextSelectionRange) => {
    requestAnimationFrame(() => {
      const el = inlineRef.current;
      if (!el) return;
      const max = el.value.length;
      el.setSelectionRange(Math.min(selection.start, max), Math.min(selection.end, max));
    });
  }, []);

  return (
    <div className={wrapperClassName ? `relative ${wrapperClassName}` : 'relative'}>
      <Field
        {...textareaProps}
        ref={inlineRef}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onValueChange(e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
        style={canExpand ? { ...style, paddingInlineEnd: EXPAND_BUTTON_INSET } : style}
      />
      {canExpand && (
        <button
          type="button"
          /* Keep focus in the field: on iOS the keyboard would otherwise drop and
             have to be raised again once the overlay mounts. */
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setIsFullscreen(true)}
          title={t('common.editFullscreen')}
          aria-label={t('common.editFullscreen')}
          data-testid="expand-textarea"
          className="absolute end-1.5 top-1.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100/90 text-gray-500 backdrop-blur-sm transition-colors hover:bg-gray-200 hover:text-gray-700 active:bg-gray-200 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none dark:bg-gray-700/80 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white dark:active:bg-gray-600"
        >
          <Maximize2 size={15} aria-hidden />
        </button>
      )}
      {/* Stay mounted while open even if the field turns disabled mid-edit,
          so the overlay closes through its exit animation instead of vanishing. */}
      {(canExpand || isFullscreen) && (
        <FullscreenTextEditor
          open={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          modalId={modalId}
          title={fullscreenTitle}
          value={value}
          onValueChange={onValueChange}
          placeholder={placeholder}
          maxLength={maxLength}
          getInitialSelection={getInitialSelection}
          onSelectionCommit={restoreSelection}
        />
      )}
    </div>
  );
};
