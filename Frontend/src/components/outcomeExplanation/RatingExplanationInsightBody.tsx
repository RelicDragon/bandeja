import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

interface RatingExplanationInsightBodyProps {
  phase: 'pending' | 'ready' | 'failed';
  committedText: string | null;
  committedLanguage: string | null;
  sourceLanguage: string | null;
  isTranslating: boolean;
  showingOriginal: boolean;
  translateFailedLanguage: string | null;
  isAuthenticated: boolean;
  onRetrySource: () => void;
  onRetryTranslate: () => void;
}

export function RatingExplanationInsightBody({
  phase,
  committedText,
  committedLanguage,
  sourceLanguage,
  isTranslating,
  showingOriginal,
  translateFailedLanguage,
  isAuthenticated,
  onRetrySource,
  onRetryTranslate,
}: RatingExplanationInsightBodyProps) {
  const { t } = useTranslation();

  if (phase === 'pending') {
    return (
      <div className="space-y-3" role="status">
        <div className="space-y-2.5">
          <div className="h-3.5 w-[94%] rounded-full bg-slate-200/90 dark:bg-slate-700/80 animate-pulse" />
          <div
            className="h-3.5 w-[88%] rounded-full bg-slate-200/80 dark:bg-slate-700/70 animate-pulse"
            style={{ animationDelay: '120ms' }}
          />
          <div
            className="h-3.5 w-[72%] rounded-full bg-slate-200/70 dark:bg-slate-700/60 animate-pulse"
            style={{ animationDelay: '240ms' }}
          />
          <div
            className="h-3.5 w-[40%] rounded-full bg-slate-200/60 dark:bg-slate-700/50 animate-pulse"
            style={{ animationDelay: '360ms' }}
          />
        </div>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 tracking-tight">
          {t('gameResults.llmRatingInsightLoading')}
        </p>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {t('gameResults.llmRatingInsightFailed')}
        </p>
        {isAuthenticated && (
          <button
            type="button"
            onClick={onRetrySource}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-slate-200/90 dark:border-slate-600/80 bg-white/90 dark:bg-slate-900/70 px-3.5 py-1.5 text-sm font-medium text-slate-800 dark:text-slate-100 shadow-sm hover:bg-white dark:hover:bg-slate-900 transition-colors"
          >
            <RefreshCw size={14} />
            {t('gameResults.llmRatingInsightRetry')}
          </button>
        )}
      </div>
    );
  }

  if (!committedText) return null;

  const paragraphs = splitParagraphs(committedText);

  return (
    <div className="relative">
      {isTranslating && (
        <div className="absolute inset-0 z-10 rounded-xl bg-white/65 dark:bg-slate-950/55 backdrop-blur-[2px] flex items-center justify-center">
          <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 tracking-tight">
            {t('gameResults.llmRatingInsightTranslating')}
          </p>
        </div>
      )}
      <div
        className={`space-y-3.5 text-[15px] leading-[1.65] text-slate-800 dark:text-slate-100 animate-in fade-in duration-300 ${
          isTranslating ? 'opacity-35' : ''
        }`}
      >
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${committedLanguage}-${index}`}
            className={index === 0 ? 'font-medium text-slate-900 dark:text-slate-50' : undefined}
          >
            {paragraph}
          </p>
        ))}
      </div>
      {!showingOriginal && !isTranslating && !translateFailedLanguage && (
        <p className="mt-3.5 text-[11px] tracking-wide text-slate-400 dark:text-slate-500">
          {t('gameResults.llmRatingInsightTranslatedFrom', {
            language: sourceLanguage?.toUpperCase(),
          })}
        </p>
      )}
      {translateFailedLanguage && (
        <div className="mt-3.5 flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white/50 dark:bg-slate-950/30 px-3 py-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('gameResults.llmRatingInsightTranslateFailed')}
          </p>
          {isAuthenticated && (
            <button
              type="button"
              onClick={onRetryTranslate}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <RefreshCw size={12} />
              {t('gameResults.llmRatingInsightRetry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
