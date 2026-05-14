import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  showLivePulse: boolean;
  showCompletedCheck: boolean;
  /** When true and `showLivePulse`, show “Not finished” instead of the Live dot badge. */
  gameResultsFinal?: boolean;
};

export function MatchResultsHeaderBadges({
  showLivePulse,
  showCompletedCheck,
  gameResultsFinal = false,
}: Props) {
  const { t } = useTranslation();
  if (!showLivePulse && !showCompletedCheck) return null;
  const notFinishedLabel = t('gameResults.matchNotFinishedBadge', { defaultValue: 'Not Finished' });
  return (
    <span className="ml-0.5 inline-flex items-center gap-1">
      {showLivePulse ? (
        gameResultsFinal ? (
          <span
            className="inline-flex max-w-[9rem] items-center rounded-full border border-amber-500/40 bg-amber-500/12 px-1.5 py-0.5 text-[8px] font-semibold leading-tight tracking-tight text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/45 dark:text-amber-200"
            title={notFinishedLabel}
          >
            {notFinishedLabel}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-red-500/35 bg-red-500/10 px-1 py-0.5 text-[8px] font-semibold uppercase leading-none tracking-tight text-red-700 dark:border-red-500/30 dark:bg-red-950/45 dark:text-red-300"
            title={t('gameResults.matchInProgressTag', { defaultValue: 'In progress' })}
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            {t('gameResults.liveTag', { defaultValue: 'Live' })}
          </span>
        )
      ) : null}
      {showCompletedCheck ? (
        <span title={t('gameResults.matchCompleteTag', { defaultValue: 'Match complete' })}>
          <Check
            className="h-3.5 w-3.5 shrink-0 stroke-[2.75] text-emerald-600 dark:text-emerald-400"
            aria-label={t('gameResults.matchCompleteTag', { defaultValue: 'Match complete' })}
          />
        </span>
      ) : null}
    </span>
  );
}
