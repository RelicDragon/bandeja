import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { validationMessage, type ValidationReason, type ScoreSuggestion } from '@/utils/scoring';

interface ScoreValidationHintProps {
  reason: ValidationReason;
  detail?: Record<string, number | string>;
  isRecommendation: boolean;
  suggestions: ScoreSuggestion[];
  onApplySuggestion: (suggestion: ScoreSuggestion) => void;
}

export const ScoreValidationHint = ({
  reason,
  detail,
  isRecommendation,
  suggestions,
  onApplySuggestion,
}: ScoreValidationHintProps) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/40">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        <p className="text-xs leading-snug text-amber-800 dark:text-amber-200">
          {isRecommendation ? `${t('gameResults.automaticScoreRecommendation')} ` : null}
          {validationMessage(t, reason, detail)}
        </p>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-5.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onApplySuggestion(s)}
              className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-800 shadow-xs transition-colors hover:bg-amber-100 active:scale-95 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-800/70"
            >
              {s.teamA}–{s.teamB}
              {s.isTieBreak ? ` · ${t('gameResults.tieBreakAbbr')}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
