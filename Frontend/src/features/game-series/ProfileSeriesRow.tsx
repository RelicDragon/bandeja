import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import type { SeriesListItem } from '@/api/series';
import { buildSeriesPath } from '@/deepLinks/catalog';
import { useMySeries } from './useSeries';
import {
  cadencePillKey,
  formatLocalTime,
  formatShortDateTime,
  formatWeekdayName,
} from './seriesFormat';

/**
 * PRD 345 — Profile → Statistics → "Your regular games".
 *
 * The third entry point into the series page, beside the card pill and the
 * series chat. Lists every series the viewer belongs to, owned or joined, with
 * the ended ones last. Renders nothing when there are none: an empty card on
 * the statistics tab would be noise rather than a next action. Also the landing
 * spot for the "Manage your series" link on the owner-cap helper, which is why
 * it must exist even for a user who has hit the cap and owns ten.
 */
export const ProfileSeriesRow = () => {
  const { t } = useTranslation();
  const enabled = isGameSeriesEnabled();
  const { data, isPending } = useMySeries(enabled);

  if (!enabled) return null;

  if (isPending) {
    return (
      <section aria-busy="true">
        <div className={`h-5 w-36 rounded ${shimmerBlock}`} />
        <div className="mt-2 flex gap-2">
          <div className={`h-24 w-40 rounded-2xl ${shimmerBlock}`} />
          <div className={`h-24 w-40 rounded-2xl ${shimmerBlock}`} />
        </div>
      </section>
    );
  }

  const series = data?.series ?? [];
  if (series.length === 0) return null;

  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-start text-sm font-semibold text-gray-900 dark:text-white">
        <Repeat className="h-4 w-4 text-primary-500" aria-hidden />
        {t('series.profileTitle')}
      </h3>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {series.map((item) => (
          <ProfileSeriesCard key={item.id} series={item} />
        ))}
      </div>
    </section>
  );
};

function ProfileSeriesCard({ series }: { series: SeriesListItem }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language;
  const ended = series.status === 'ENDED';

  // Assembled from three already-translated pieces rather than a template key:
  // a key holding only placeholders and a middot is byte-identical in every
  // locale, which the parity test correctly rejects as an untranslated copy.
  const cadenceLine = [
    t(cadencePillKey(series.cadence)),
    `${formatWeekdayName(series.weekday, locale)} ${formatLocalTime(series.startTimeLocal, locale)}`,
  ].join(' · ');

  const nextLine = ended
    ? t('series.ended')
    : series.nextOccurrenceAt
      ? t('series.nextLabel', {
          date: formatShortDateTime(series.nextOccurrenceAt, { locale }),
        })
      : t('series.emptyUpcomingTitle');

  return (
    <button
      type="button"
      onClick={() => navigate(buildSeriesPath(series.id))}
      aria-label={t('series.profileCardAria', { name: series.name })}
      className={`flex min-h-11 w-40 shrink-0 flex-col justify-between rounded-2xl border p-3 text-start shadow-sm transition active:scale-[0.98] ${pressScaleGuard} ${
        ended
          ? 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400'
          : 'border-primary-200 bg-primary-50 text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-100'
      }`}
    >
      <span className="truncate text-sm font-semibold">{series.name}</span>
      <span className="mt-1 block truncate text-[11px] font-medium opacity-80">{cadenceLine}</span>
      <span className="mt-2 block truncate text-[11px] font-medium opacity-70">{nextLine}</span>
      <span className="mt-1 block text-[11px] font-medium opacity-70">
        {t('series.regularsCount', { count: series.regularCount })}
      </span>
    </button>
  );
}
