import { useTranslation } from 'react-i18next';
import { noviceRankId } from '@shared/novice';
import { useNovice } from '@/hooks/useNovice';
import { NoviceProgressRing } from '@/components/novice/welcome/NoviceProgress';
import { NoviceUnlockAllLink } from '@/components/novice/welcome/NoviceUnlockAllLink';
import {
  NOVICE_FEATURE_ICONS,
  nextRankPreview,
  noviceFeatureLabelKey,
  noviceRankLabelKey,
} from '@/components/novice/welcome/noviceFeatureMeta';

/**
 * PRD 358 — compact rank card at the top of My while novice mode is on: rank,
 * progress to Regular, what the next rank reveals, and the unlock-all escape.
 */
export function NoviceProgressCard() {
  const { t } = useTranslation();
  const { isActive, rank, progress } = useNovice();
  if (!isActive) return null;

  const next = nextRankPreview(rank);

  return (
    <section
      className="mb-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-3 shadow-sm"
      data-testid="novice-progress-card"
    >
      <div className="flex items-center gap-3">
        <NoviceProgressRing current={progress.current} target={progress.target} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            {t(noviceRankLabelKey(noviceRankId(rank)))}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {t('novice.shell.progressToRegular', {
              current: progress.current,
              target: progress.target,
            })}
          </p>
          {next ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="shrink-0">
                {t('novice.shell.nextUnlock', { rank: t(noviceRankLabelKey(noviceRankId(next.rank))) })}
              </span>
              {next.features.slice(0, 3).map((feature) => {
                const Icon = NOVICE_FEATURE_ICONS[feature];
                return (
                  <span key={feature} className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                    <Icon size={12} className="shrink-0" aria-hidden />
                    {t(noviceFeatureLabelKey(feature))}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-1 flex justify-end">
        <NoviceUnlockAllLink />
      </div>
    </section>
  );
}
