import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, CircleDashed, Equal, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ResultsMatchRef, ResultsProgressSummary } from '@/utils/resultsBoardNavigation';

const MAX_ROWS = 4;

interface FinishSummaryProps {
  summary: ResultsProgressSummary;
  onGoTo: (ref: ResultsMatchRef) => void;
}

const MatchRefList = ({
  refs,
  onGoTo,
}: {
  refs: ResultsMatchRef[];
  onGoTo: (ref: ResultsMatchRef) => void;
}) => {
  const { t } = useTranslation();
  const shown = refs.slice(0, MAX_ROWS);
  return (
    <ul className="mt-1 space-y-0.5">
      {shown.map((ref) => (
        <li key={ref.matchId}>
          <button
            type="button"
            onClick={() => onGoTo(ref)}
            className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-2 text-start text-xs text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
          >
            <span className="truncate">
              {t('gameResults.roundNumber', { number: ref.roundNumber })} ·{' '}
              {t('gameResults.match', { number: ref.matchNumber })}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary-600 dark:text-primary-400">
              {t('gameResults.goTo')}
              <ArrowRight size={12} aria-hidden />
            </span>
          </button>
        </li>
      ))}
      {refs.length > shown.length ? (
        <li className="px-2 text-[11px] text-gray-500 dark:text-gray-400">
          {t('gameResults.andMore', { number: refs.length - shown.length })}
        </li>
      ) : null}
    </ul>
  );
};

const SummaryRow = ({ icon: Icon, label, tone }: { icon: LucideIcon; label: string; tone: 'ok' | 'warn' | 'info' }) => (
  <p
    className={`flex items-center gap-2 text-sm font-medium ${
      tone === 'ok'
        ? 'text-emerald-700 dark:text-emerald-300'
        : tone === 'warn'
          ? 'text-amber-800 dark:text-amber-200'
          : 'text-gray-600 dark:text-gray-300'
    }`}
  >
    <Icon size={16} className="shrink-0" aria-hidden />
    {label}
  </p>
);

/** What "Finish" is about to lock in: unscored matches, missing players, ties. */
export const FinishSummary = ({ summary, onGoTo }: FinishSummaryProps) => {
  const { t } = useTranslation();
  const allScored = summary.unscored.length === 0 && summary.incompleteLineups.length === 0;

  return (
    <div className="mx-4 mb-4 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
      {allScored ? (
        <SummaryRow icon={CheckCircle2} tone="ok" label={t('gameResults.finishSummaryAllScored')} />
      ) : null}
      {summary.unscored.length > 0 ? (
        <div>
          <SummaryRow
            icon={CircleDashed}
            tone="warn"
            label={t('gameResults.finishSummaryUnscored', { number: summary.unscored.length })}
          />
          <MatchRefList refs={summary.unscored} onGoTo={onGoTo} />
        </div>
      ) : null}
      {summary.incompleteLineups.length > 0 ? (
        <div>
          <SummaryRow
            icon={UserPlus}
            tone="warn"
            label={t('gameResults.finishSummaryIncomplete', { number: summary.incompleteLineups.length })}
          />
          <MatchRefList refs={summary.incompleteLineups} onGoTo={onGoTo} />
        </div>
      ) : null}
      {summary.ties > 0 ? (
        <SummaryRow icon={Equal} tone="info" label={t('gameResults.finishSummaryTies', { number: summary.ties })} />
      ) : null}
    </div>
  );
};
