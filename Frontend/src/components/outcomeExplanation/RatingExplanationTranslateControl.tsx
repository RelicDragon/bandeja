import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Languages, Loader2 } from 'lucide-react';
import {
  TRANSLATION_LANGUAGES,
  getTranslationLanguageFlag,
} from '@/utils/translationLanguages';

interface RatingExplanationTranslateControlProps {
  sourceLanguage: string;
  activeLanguage: string;
  isTranslating: boolean;
  onSelectLanguage: (language: string) => void;
  disabled?: boolean;
}

export function RatingExplanationTranslateControl({
  sourceLanguage,
  activeLanguage,
  isTranslating,
  onSelectLanguage,
  disabled = false,
}: RatingExplanationTranslateControlProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = useCallback(
    (code: string) => {
      setOpen(false);
      onSelectLanguage(code);
    },
    [onSelectLanguage],
  );

  const activeFlag = getTranslationLanguageFlag(activeLanguage);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200/80 dark:border-blue-800/70 bg-white/70 dark:bg-slate-900/50 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 transition-colors disabled:opacity-50"
        title={t('gameResults.llmRatingInsightTranslate')}
      >
        {isTranslating ? (
          <Loader2 size={14} className="animate-spin text-blue-600 dark:text-blue-400" />
        ) : (
          <Languages size={14} className="text-blue-600 dark:text-blue-400" />
        )}
        <span className="text-base leading-none" aria-hidden>
          {activeFlag}
        </span>
        <span className="uppercase tracking-wide">{activeLanguage}</span>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('gameResults.llmRatingInsightTranslate')}
          className="absolute right-0 top-full z-30 mt-1.5 w-56 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {TRANSLATION_LANGUAGES.map((lang) => {
            const selected = lang.code === activeLanguage;
            const isOriginal = lang.code === sourceLanguage;
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-slate-900 dark:text-slate-50'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-base leading-none w-5 text-center" aria-hidden>
                  {getTranslationLanguageFlag(lang.code)}
                </span>
                <span className="flex-1 min-w-0 truncate">{lang.label}</span>
                {isOriginal && (
                  <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {t('gameResults.llmRatingInsightOriginal')}
                  </span>
                )}
                {selected && <Check size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
