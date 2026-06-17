import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { StickyNote, Loader2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userGameNotesApi, UserGameNote } from '@/api';
import { InfoIconChip } from './InfoIconChip';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface GameInfoUserNoteProps {
  gameId: string;
  initialContent?: string | null;
}

export const GameInfoUserNote = ({ gameId, initialContent }: GameInfoUserNoteProps) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [note, setNote] = useState<UserGameNote | null>(
    initialContent
      ? { id: '', userId: '', gameId, content: initialContent, createdAt: '', updatedAt: '' }
      : null,
  );
  const [content, setContent] = useState(initialContent || '');
  const [loading, setLoading] = useState(!initialContent);
  const [saving, setSaving] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState(initialContent || '');
  const [isActive, setIsActive] = useState(Boolean(initialContent?.trim()));
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const minHeightPx = 36;
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, isActive, adjustHeight]);

  const fetchNote = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userGameNotesApi.getNote(gameId);
      const fetchedNote = response.data.data;
      setNote(fetchedNote);
      const noteContent = fetchedNote?.content || '';
      setContent(noteContent);
      setLastSavedContent(noteContent);
      if (noteContent.trim()) setIsActive(true);
    } catch (error) {
      console.error('Failed to fetch note:', error);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (!initialContent) fetchNote();
  }, [gameId, initialContent, fetchNote]);

  const saveNote = useCallback(async (contentToSave: string) => {
    if (!contentToSave.trim()) {
      if (note) {
        try {
          setSaving(true);
          await userGameNotesApi.deleteNote(gameId);
          setNote(null);
          setLastSavedContent('');
        } catch (error) {
          console.error('Failed to delete note:', error);
        } finally {
          setSaving(false);
        }
      }
      return;
    }

    try {
      setSaving(true);
      if (note) {
        const response = await userGameNotesApi.updateNote(gameId, contentToSave);
        setNote(response.data.data);
      } else {
        const response = await userGameNotesApi.createNote(gameId, contentToSave);
        setNote(response.data.data);
      }
      setLastSavedContent(contentToSave);
    } catch (error: unknown) {
      console.error('Failed to save note:', error);
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setSaving(false);
    }
  }, [gameId, note, t]);

  const debouncedSave = useCallback((value: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (value === lastSavedContent) return;
    debounceTimerRef.current = setTimeout(() => saveNote(value), 1000);
  }, [saveNote, lastSavedContent]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    debouncedSave(newContent);
  };

  const handleActivate = () => {
    setIsActive(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!content.trim()) setIsActive(false);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  if (loading) return null;

  const hasContent = Boolean(content.trim());
  const showEditor = isActive || hasContent;
  const showTitle = !hasContent;
  const expandTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.21, 0.47, 0.32, 0.98] as const };

  return (
    <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
      <InfoIconChip className="bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400">
        <StickyNote size={18} />
      </InfoIconChip>

      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          {!showEditor ? (
            <motion.button
              key="placeholder"
              type="button"
              onClick={handleActivate}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={expandTransition}
              className="text-xs text-gray-400 dark:text-gray-500 italic hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
            >
              {t('userGameNotes.placeholder')}
            </motion.button>
          ) : (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={expandTransition}
              className={showTitle ? 'space-y-1.5' : ''}
            >
              {showTitle && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t('userGameNotes.title')}
                  </span>
                  <span title={t('userGameNotes.privacyHint')}>
                    <Lock size={11} className="text-gray-400 dark:text-gray-500" />
                  </span>
                  {saving && (
                    <Loader2 size={12} className="text-primary-600 dark:text-primary-400 animate-spin" />
                  )}
                </div>
              )}
              <div className="relative">
                {saving && !showTitle && (
                  <Loader2
                    size={12}
                    className="absolute right-0 top-1 text-primary-600 dark:text-primary-400 animate-spin"
                  />
                )}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={handleContentChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  placeholder={t('userGameNotes.placeholder')}
                  rows={1}
                  className={[
                    'w-full min-h-[2.25rem] overflow-y-auto rounded-lg transition-all duration-200 focus:outline-none text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 resize-none',
                    isFocused
                      ? 'px-3 py-2 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 ring-2 ring-amber-400/40 dark:ring-amber-500/30'
                      : 'px-0 py-1 bg-transparent border border-transparent',
                  ].join(' ')}
                  maxLength={5000}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
