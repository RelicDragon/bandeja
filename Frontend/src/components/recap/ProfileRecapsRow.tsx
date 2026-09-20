import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { MonthlyRecapCard } from '@/api/recap';
import { useAuthStore } from '@/store/authStore';
import { useRecapListQuery } from '@/queries/recap/useRecapQueries';
import { useRecapFormatters } from '@/features/recap/recapFormat';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { RecapStoryViewer } from './RecapStoryViewer';

/**
 * PRD 353 — Profile → Statistics → Recaps.
 *
 * A horizontal row of month cards, newest first, twelve months deep. Renders
 * nothing at all when the user has no recap yet: an empty "you have no recaps"
 * card on the statistics tab would be noise, not a next action.
 */

export const ProfileRecapsRow = () => {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const { data, isPending } = useRecapListQuery(Boolean(userId));
  const [monthKey, setMonthKey] = useState<string | null>(null);

  const handleOpen = useCallback((key: string) => setMonthKey(key), []);
  const handleClose = useCallback(() => setMonthKey(null), []);

  // The query is disabled without a user, and a disabled query stays `pending`
  // forever — that would pin the skeleton on screen.
  if (!userId) return null;

  if (isPending) {
    return (
      <section aria-busy="true">
        <div className={`h-5 w-28 rounded ${shimmerBlock}`} />
        <div className="mt-2 flex gap-2">
          <div className={`h-24 w-32 rounded-2xl ${shimmerBlock}`} />
          <div className={`h-24 w-32 rounded-2xl ${shimmerBlock}`} />
        </div>
      </section>
    );
  }

  const recaps = data?.recaps ?? [];
  if (recaps.length === 0) return null;

  return (
    <>
      <section>
        <h3 className="flex items-center gap-1.5 text-start text-sm font-semibold text-gray-900 dark:text-white">
          <Sparkles className="h-4 w-4 text-primary-500" aria-hidden />
          {t('recap.profile.title')}
        </h3>
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
          {recaps.map((recap) => (
            <RecapMonthCard key={recap.monthKey} recap={recap} onOpen={handleOpen} />
          ))}
        </div>
      </section>
      <RecapStoryViewer open={monthKey != null} monthKey={monthKey} onClose={handleClose} />
    </>
  );
};

function RecapMonthCard({
  recap,
  onOpen,
}: {
  recap: MonthlyRecapCard;
  onOpen: (monthKey: string) => void;
}) {
  const { t } = useTranslation();
  const formatters = useRecapFormatters();
  const month = formatters.monthLong(recap.monthStart);

  return (
    <button
      type="button"
      onClick={() => onOpen(recap.monthKey)}
      aria-label={t('recap.profile.cardAria', { month })}
      className={`flex min-h-11 w-32 shrink-0 flex-col justify-between rounded-2xl bg-gradient-to-br from-sky-500 via-violet-600 to-slate-900 p-3 text-start text-white shadow-sm transition active:scale-[0.98] ${pressScaleGuard}`}
    >
      <span className="truncate text-sm font-semibold">{month}</span>
      <span className="mt-2 block text-2xl font-extrabold leading-none tabular-nums">
        {formatters.number(recap.games)}
      </span>
      <span className="mt-1 block text-[11px] font-medium text-white/85">
        {recap.winRatePct == null
          ? t('recap.profile.gamesOnly', { count: recap.games })
          : t('recap.profile.gamesAndWinRate', {
              count: recap.games,
              percent: formatters.percent(recap.winRatePct),
            })}
      </span>
    </button>
  );
}
