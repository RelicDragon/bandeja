import { BarChart3, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PlayerLevelFeedbackAggregate } from '@/api/users';

type Props = {
  aggregate?: PlayerLevelFeedbackAggregate;
  isOwnProfile: boolean;
};

const ROWS = [
  { verdict: 'HIGHER' as const, color: '#3b82f6', dot: 'bg-blue-500' },
  { verdict: 'ABOUT_RIGHT' as const, color: '#8b5cf6', dot: 'bg-violet-500' },
  { verdict: 'LOWER' as const, color: '#f59e0b', dot: 'bg-amber-500' },
];

export function PlayerLevelFeedbackAggregateCard({ aggregate, isOwnProfile }: Props) {
  const { t } = useTranslation();

  if (!aggregate?.available) {
    if (!isOwnProfile) return null;
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-300">
            <LockKeyhole size={19} aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('playerCard.levelFeedback.title')}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {t('playerCard.levelFeedback.pending')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const higher = aggregate.percentages.HIGHER;
  const aboutRight = aggregate.percentages.ABOUT_RIGHT;
  const dominant = ROWS.reduce((best, row) =>
    aggregate.percentages[row.verdict] > aggregate.percentages[best.verdict] ? row : best
  );
  const donutBackground = `conic-gradient(${ROWS[0].color} 0 ${higher}%, ${ROWS[1].color} ${higher}% ${higher + aboutRight}%, ${ROWS[2].color} ${higher + aboutRight}% 100%)`;
  const chartLabel = ROWS.map((row) =>
    `${t(`playerCard.levelFeedback.verdict.${row.verdict}`)} ${aggregate.percentages[row.verdict]}%`
  ).join(', ');

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm dark:border-white/10 dark:from-white/[0.055] dark:to-white/[0.025]">
      <div className="flex items-center gap-2">
        <BarChart3 size={19} className="text-sky-600 dark:text-sky-300" aria-hidden />
        <h3 className="text-sm font-black text-slate-900 dark:text-white">
          {t('playerCard.levelFeedback.title')}
        </h3>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {t('playerCard.levelFeedback.basedOn', {
          count: aggregate.totalEvaluations,
          games: aggregate.totalGames,
        })}
      </p>

      <div className="mt-4 flex items-center gap-5">
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{ background: donutBackground }}
          role="img"
          aria-label={chartLabel}
        >
          <div className="absolute inset-[18px] flex items-center justify-center rounded-full bg-white shadow-inner dark:bg-slate-800">
            <span className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('playerCard.levelFeedback.players')}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          {ROWS.map((row) => {
            const isDominant = row.verdict === dominant.verdict;
            return (
              <div key={row.verdict} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.dot}`} aria-hidden />
                <span className={`min-w-0 flex-1 text-xs ${isDominant ? 'font-black text-slate-900 dark:text-white' : 'font-medium text-slate-600 dark:text-slate-300'}`}>
                  {t(`playerCard.levelFeedback.verdict.${row.verdict}`)}
                </span>
                <span className={`tabular-nums text-sm ${isDominant ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-600 dark:text-slate-300'}`}>
                  {aggregate.percentages[row.verdict]}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-white/[0.055] dark:text-slate-400">
        {t('playerCard.levelFeedback.disclaimer')}
      </p>
    </section>
  );
}
