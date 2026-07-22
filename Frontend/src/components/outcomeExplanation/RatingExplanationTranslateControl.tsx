import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [menuPos, setMenuPos] = useState<{ top: number; right: number; maxHeight: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const gap = 6;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const spaceAbove = rect.top - gap - viewportPadding;
    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(256, openUpward ? spaceAbove : spaceBelow));
    setMenuPos({
      top: openUpward ? Math.max(viewportPadding, rect.top - gap - maxHeight) : rect.bottom + gap,
      right: Math.max(viewportPadding, window.innerWidth - rect.right),
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
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
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 dark:border-emerald-800/60 bg-white/80 dark:bg-slate-900/55 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-900 transition-colors disabled:opacity-50"
        title={t('gameResults.llmRatingInsightTranslate')}
      >
        {isTranslating ? (
          <Loader2 size={14} className="animate-spin text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Languages size={14} className="text-emerald-600 dark:text-emerald-400" />
        )}
        <span className="text-base leading-none" aria-hidden>
          {activeFlag}
        </span>
        <span className="uppercase tracking-wide">{activeLanguage}</span>
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={t('gameResults.llmRatingInsightTranslate')}
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              maxHeight: menuPos.maxHeight,
            }}
            className="z-[80] w-56 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl shadow-slate-900/10 animate-in fade-in zoom-in-95 duration-150"
            data-rating-explanation-lang-menu
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
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors first:rounded-t-2xl last:rounded-b-2xl ${
                    selected
                      ? 'bg-emerald-50 dark:bg-emerald-950/45 text-slate-900 dark:text-slate-50'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <span className="text-base leading-none w-5 text-center" aria-hidden>
                    {getTranslationLanguageFlag(lang.code)}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{lang.label}</span>
                  {isOriginal && (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-600/80 dark:text-emerald-400/80">
                      {t('gameResults.llmRatingInsightOriginal')}
                    </span>
                  )}
                  {selected && (
                    <Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
