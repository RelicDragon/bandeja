import { useTranslation } from 'react-i18next';
import { Bookmark, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { InfoIconChip } from './InfoIconChip';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useGameInfoUserNote } from '@/hooks/useGameInfoUserNote';

interface GameInfoUserNoteProps {
  gameId: string;
  initialContent?: string | null;
}

const MOTION_EASE = [0.21, 0.47, 0.32, 0.98] as const;

export const GameInfoUserNote = ({ gameId, initialContent }: GameInfoUserNoteProps) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const {
    loading,
    saving,
    content,
    visualMode,
    textareaRef,
    activate,
    handleChange,
    handleFocus,
    handleBlur,
  } = useGameInfoUserNote(gameId, initialContent);

  if (loading) return null;

  const motionTransition = reduceMotion ? { duration: 0 } : { duration: 0.3, ease: MOTION_EASE };

  return (
    <div
      className={`flex gap-3 text-sm text-gray-700 dark:text-gray-300 ${
        visualMode === 'editing' ? 'items-start' : 'items-center'
      }`}
    >
      <InfoIconChip className="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
        <Bookmark size={18} aria-hidden />
      </InfoIconChip>

      <motion.div layout transition={motionTransition} className="relative flex-1 min-w-0">
        {saving && visualMode === 'editing' && (
          <Loader2
            size={12}
            aria-hidden
            className="absolute right-2.5 top-2.5 z-10 text-amber-600 dark:text-amber-400 animate-spin pointer-events-none"
          />
        )}
        <motion.textarea
          ref={textareaRef}
          layout
          value={content}
          readOnly={visualMode === 'placeholder'}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPointerDown={() => {
            if (visualMode === 'placeholder') activate();
          }}
          placeholder={t('userGameNotes.placeholder')}
          aria-label={t('userGameNotes.title')}
          aria-busy={saving}
          rows={1}
          animate={visualMode}
          variants={{
            placeholder: {
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: 0,
              paddingRight: 0,
            },
            editing: {
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 10,
              paddingRight: saving ? 28 : 10,
            },
            display: {
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: 0,
              paddingRight: 0,
            },
          }}
          transition={motionTransition}
          className={[
            'block w-full [field-sizing:content] overflow-y-auto rounded-lg resize-none border-2 box-border focus:outline-none',
            'text-xs leading-relaxed whitespace-pre-wrap break-words transition-[background-color,border-color,color,min-height] duration-300 ease-out',
            visualMode === 'editing' ? 'min-h-[2.25rem]' : 'min-h-0',
            visualMode === 'placeholder'
              ? 'italic text-gray-400 dark:text-gray-500 bg-transparent border-transparent cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 placeholder:text-gray-400 dark:placeholder:text-gray-500'
              : visualMode === 'editing'
                ? 'not-italic text-gray-700 dark:text-gray-300 bg-amber-50/90 dark:bg-amber-950/30 border-amber-300/90 dark:border-amber-700/70 placeholder:text-gray-400 dark:placeholder:text-gray-500'
                : 'not-italic text-gray-600 dark:text-gray-400 bg-transparent border-transparent cursor-text',
          ].join(' ')}
          maxLength={5000}
        />
      </motion.div>
    </div>
  );
};
