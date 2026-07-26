import { useTranslation } from 'react-i18next';
import { ChevronLeft, MessageSquare, Redo2, Undo2 } from 'lucide-react';

type PhotoStoryTopChromeProps = {
  segmentCount: number;
  activeIndex: number;
  onSelectSegment: (i: number) => void;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  captionOpen: boolean;
  onToggleCaption: () => void;
  disabled?: boolean;
};

const glassBtn =
  'flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white shadow-sm ring-1 ring-white/15 backdrop-blur-xl transition active:scale-95 disabled:opacity-35';

export function PhotoStoryTopChrome({
  segmentCount,
  activeIndex,
  onSelectSegment,
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  captionOpen,
  onToggleCaption,
  disabled,
}: PhotoStoryTopChromeProps) {
  const { t } = useTranslation();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/70 via-black/25 to-transparent pt-[max(0.5rem,env(safe-area-inset-top))] pb-10 px-3">
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={disabled}
          className={glassBtn}
          aria-label={t('common.back')}
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>

        {segmentCount > 1 ? (
          <div className="flex flex-1 justify-center gap-1.5">
            {Array.from({ length: segmentCount }, (_, i) => (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onSelectSegment(i)}
                className={`h-1 rounded-full transition-all duration-200 ${
                  i === activeIndex ? 'w-7 bg-white' : 'w-2.5 bg-white/40'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <button
          type="button"
          onClick={onToggleCaption}
          disabled={disabled}
          className={`${glassBtn} ${captionOpen ? '!bg-white !text-black !ring-0' : ''}`}
          aria-label={t('stories.captionLabel')}
        >
          <MessageSquare size={18} strokeWidth={2.2} />
        </button>

        <button
          type="button"
          disabled={disabled || !canUndo}
          onClick={onUndo}
          className={glassBtn}
          aria-label={t('stories.editor.undo')}
        >
          <Undo2 size={18} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          disabled={disabled || !canRedo}
          onClick={onRedo}
          className={glassBtn}
          aria-label={t('stories.editor.redo')}
        >
          <Redo2 size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
