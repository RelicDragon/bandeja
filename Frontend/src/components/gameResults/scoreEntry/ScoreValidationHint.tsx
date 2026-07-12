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
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        isRecommendation
          ? 'border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30'
          : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isRecommendation ? 'text-blue-500' : 'text-amber-500'}`}
          aria-hidden
        />
        <p
          className={`text-xs leading-snug ${isRecommendation ? 'text-blue-800 dark:text-blue-200' : 'text-amber-800 dark:text-amber-200'}`}
        >
          {isRecommendation ? `${t('gameResults.automaticScoreRecommendation')} ` : null}
          {validationMessage(t, reason, detail)}
        </p>
      </div>
      {suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onApplySuggestion(s)}
              className="rounded-md border border-current/20 bg-white/80 px-2 py-0.5 text-xs font-semibold tabular-nums active:scale-95 dark:bg-gray-900/50"
            >
              {s.teamA}–{s.teamB}
              {s.isTieBreak ? ` · ${t('gameResults.tieBreakAbbr')}` : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
