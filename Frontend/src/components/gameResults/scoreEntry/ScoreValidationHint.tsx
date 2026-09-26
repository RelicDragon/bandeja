import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import { validationMessage, type ValidationReason, type ScoreSuggestion } from '@/utils/scoring';
import { EASE_CLASS } from './scoreEntryStyles';

interface ScoreValidationHintProps {
  reason: ValidationReason;
  detail?: Record<string, number | string>;
  isRecommendation: boolean;
  suggestions: ScoreSuggestion[];
  onApplySuggestion: (suggestion: ScoreSuggestion) => void;
}

const TONE = {
  recommendation: {
    card: 'bg-sky-500/[0.07] ring-sky-500/20 dark:bg-sky-400/[0.08] dark:ring-sky-400/20',
    badge: 'bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
    text: 'text-sky-950 dark:text-sky-100',
  },
  warning: {
    card: 'bg-amber-500/[0.08] ring-amber-500/25 dark:bg-amber-400/[0.08] dark:ring-amber-400/20',
    badge: 'bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300',
    text: 'text-amber-950 dark:text-amber-100',
  },
} as const;

export const ScoreValidationHint = ({
  reason,
  detail,
  isRecommendation,
  suggestions,
  onApplySuggestion,
}: ScoreValidationHintProps) => {
  const { t } = useTranslation();
  const tone = isRecommendation ? TONE.recommendation : TONE.warning;
  const Icon = isRecommendation ? Lightbulb : AlertTriangle;

  return (
    <div className={`rounded-[1.25rem] px-3.5 py-2.5 ring-1 ring-inset ${tone.card}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tone.badge}`} aria-hidden>
          <Icon size={11} strokeWidth={2} />
        </span>
        <p className={`text-[12.5px] leading-snug ${tone.text}`}>
          {isRecommendation ? `${t('gameResults.automaticScoreRecommendation')} ` : null}
          {validationMessage(t, reason, detail)}
        </p>
      </div>
      {suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 ps-7.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onApplySuggestion(s)}
              className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-inset ring-gray-900/[0.06] transition-transform duration-300 ${EASE_CLASS} active:scale-95 dark:bg-white/10 dark:text-white dark:ring-white/10`}
            >
              <span className="font-brand text-[13px] font-semibold leading-none tabular-nums">
                {s.teamA}–{s.teamB}
              </span>
              {s.isTieBreak ? (
                <span className="text-[10px] font-semibold uppercase leading-none tracking-wider text-gray-500 dark:text-gray-400">
                  {t('gameResults.tieBreakAbbr')}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
