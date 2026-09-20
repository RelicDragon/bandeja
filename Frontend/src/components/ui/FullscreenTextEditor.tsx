import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minimize2 } from 'lucide-react';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';

export interface TextSelectionRange {
  start: number;
  end: number;
}

interface FullscreenTextEditorProps {
  open: boolean;
  /** Closing always keeps the text — the overlay edits the same value live. */
  onClose: () => void;
  title: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  modalId?: string;
  /** Caret to adopt when the editor opens. Must be stable (`useCallback`). */
  getInitialSelection?: () => TextSelectionRange | null;
  /** Caret the user left behind, so the inline field can adopt it back. */
  onSelectionCommit?: (selection: TextSelectionRange) => void;
}

/**
 * Distraction-free editor for long memo fields.
 *
 * Mobile is the primary target: `.fullscreen-text-editor` (see
 * `styles/keyboard/fullscreen-text-editor.css`) pins the panel to the visual
 * viewport, so on Capacitor iOS/Android and iOS Safari the header, the caret and
 * the footer stay above the software keyboard instead of behind it.
 */
export const FullscreenTextEditor = ({
  open,
  onClose,
  title,
  value,
  onValueChange,
  placeholder,
  maxLength,
  modalId,
  getInitialSelection,
  onSelectionCommit,
}: FullscreenTextEditorProps) => {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /* Take Radix's open-focus: one direct focus keeps the iOS keyboard up, while
     the default hop through the first button would dismiss and re-raise it. */
  const focusEditor = useCallback(
    (event: Event) => {
      event.preventDefault();
      const el = textareaRef.current;
      if (!el) return;
      const max = el.value.length;
      const selection = getInitialSelection?.() ?? null;
      el.focus({ preventScroll: true });
      el.setSelectionRange(
        selection ? Math.min(selection.start, max) : max,
        selection ? Math.min(selection.end, max) : max,
      );
    },
    [getInitialSelection],
  );

  const close = useCallback(() => {
    const el = textareaRef.current;
    if (el) onSelectionCommit?.({ start: el.selectionStart, end: el.selectionEnd });
    onClose();
  }, [onClose, onSelectionCommit]);

  return (
    <FullScreenDialog
      open={open}
      onClose={close}
      modalId={modalId}
      title={title}
      closeOnInteractOutside={false}
      overlayClassName="fullscreen-backdrop-overlay"
      contentClassName="fullscreen-text-editor fullscreen-text-editor-animate"
      bodyClassName="fullscreen-text-editor-body"
      onOpenAutoFocus={focusEditor}
    >
      <div
        className="flex min-h-0 flex-1 flex-col bg-white dark:bg-gray-900"
        data-testid="fullscreen-text-editor"
      >
        <header className="fullscreen-text-editor-header flex shrink-0 items-center gap-2 border-b border-gray-200 px-2 pb-2 dark:border-gray-800">
          <button
            type="button"
            onClick={close}
            aria-label={t('common.exitFullscreen')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 active:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-800"
          >
            <Minimize2 size={18} aria-hidden />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 active:bg-primary-700"
            data-testid="fullscreen-text-editor-done"
          >
            <Check size={16} aria-hidden />
            {t('common.done')}
          </button>
        </header>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              close();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          className="fullscreen-text-editor-input min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 text-base leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
          dir="auto"
        />

        <footer className="fullscreen-text-editor-footer shrink-0 border-t border-gray-100 px-4 pt-1.5 text-[11px] tabular-nums text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {maxLength ? `${value.length}/${maxLength}` : value.length} {t('common.characters')}
        </footer>
      </div>
    </FullScreenDialog>
  );
};
