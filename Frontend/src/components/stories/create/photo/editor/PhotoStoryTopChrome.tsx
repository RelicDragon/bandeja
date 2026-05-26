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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/80 via-black/40 to-transparent pt-[max(0.5rem,env(safe-area-inset-top))] pb-8 px-3">
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={disabled}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md disabled:opacity-40"
          aria-label={t('common.back')}
        >
          <ChevronLeft size={24} />
        </button>

        {segmentCount > 1 ? (
          <div className="flex flex-1 justify-center gap-1.5">
            {Array.from({ length: segmentCount }, (_, i) => (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onSelectSegment(i)}
                className={`h-1 rounded-full transition-all ${
                  i === activeIndex ? 'w-6 bg-white' : 'w-3 bg-white/35'
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
          className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md ${
            captionOpen ? 'bg-white text-black' : 'bg-black/40 text-white'
          }`}
          aria-label={t('stories.captionLabel')}
        >
          <MessageSquare size={20} />
        </button>

        <button
          type="button"
          disabled={disabled || !canUndo}
          onClick={onUndo}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md disabled:opacity-30"
          aria-label={t('stories.editor.undo')}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          disabled={disabled || !canRedo}
          onClick={onRedo}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md disabled:opacity-30"
          aria-label={t('stories.editor.redo')}
        >
          <Redo2 size={18} />
        </button>
      </div>
    </div>
  );
}
