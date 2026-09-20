import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { CalendarClock, Check } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { seriesApi, type SeriesNextPrompt } from '@/api/series';
import { formatShortDate } from './seriesFormat';
import { useSeriesConfirmationsLive } from './useSeries';

/**
 * PRD 345 — organizer strip on an occurrence.
 *
 * "Next: Tue 1 Oct · 3 of 4 regulars confirmed" with a confirmation check on
 * each regular's avatar, plus **Skip next** and **Edit series**. The counter is
 * live: the component joins the *next* occurrence's `game-{id}` room and reacts
 * to `game-series-confirmations-updated`, animating each check badge with a
 * 200 ms scale spring (immediate under reduced motion).
 *
 * Colour never carries the state alone — every avatar has a visually hidden
 * "{name} confirmed" / "{name} has not confirmed" label.
 */

/** 32 px face with a letter fallback — the strip needs no presence or badges. */
const SeriesRegularFace = ({ avatar, name }: { avatar: string | null; name: string }) => {
  const initial = name.trim() ? [...name.trim()][0].toLocaleUpperCase('und') : '?';
  if (!avatar) {
    return (
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700 ring-2 ring-white dark:bg-gray-600 dark:text-gray-100 dark:ring-gray-800"
        aria-hidden
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      src={avatar}
      alt=""
      loading="lazy"
      className="h-8 w-8 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
    />
  );
};

export interface SeriesOrganizerStripProps {
  prompt: SeriesNextPrompt;
  onEditSeries: () => void;
  onSkipped?: () => void;
  className?: string;
}

const MAX_AVATARS = 6;

export const SeriesOrganizerStrip = ({
  prompt,
  onEditSeries,
  onSkipped,
  className = '',
}: SeriesOrganizerStripProps) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [counts, setCounts] = useState({
    confirmedCount: prompt.confirmedCount,
    regularCount: prompt.regularCount,
  });
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);

  useSeriesConfirmationsLive(prompt.nextGameId, setCounts);

  const locale = i18n.language;
  const nextDateLabel = formatShortDate(prompt.nextStartTime, { locale });

  const handleSkip = useCallback(async () => {
    if (!prompt.nextOccurrenceDate) return;
    setSkipping(true);
    try {
      await seriesApi.skipOccurrence(prompt.seriesId, prompt.nextOccurrenceDate);
      toast.success(t('series.skipped'));
      setConfirmSkipOpen(false);
      onSkipped?.();
    } catch {
      toast.error(t('series.skipError'));
    } finally {
      setSkipping(false);
    }
  }, [onSkipped, prompt.nextOccurrenceDate, prompt.seriesId, t]);

  const shown = prompt.regulars.slice(0, MAX_AVATARS);
  const overflow = prompt.regulars.length - shown.length;

  return (
    <section
      aria-label={t('series.nextLabel', { date: nextDateLabel })}
      className={`rounded-2xl border border-gray-200 bg-white/80 p-3 dark:border-gray-700 dark:bg-gray-800/60 ${className}`.trim()}
    >
      <div className="flex items-start gap-2">
        <CalendarClock
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {t('series.nextLabel', { date: nextDateLabel })}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {t('series.confirmedOf', {
              confirmed: counts.confirmedCount,
              count: counts.regularCount,
            })}
          </p>
        </div>
      </div>

      {shown.length > 0 && (
        <ul className="mt-2 flex flex-wrap items-center gap-2" aria-label={t('series.regularsTitle')}>
          {shown.map((regular) => {
            const name = [regular.firstName, regular.lastName].filter(Boolean).join(' ').trim();
            return (
              <li key={regular.userId} className="relative">
                <SeriesRegularFace avatar={regular.avatar} name={name} />
                {regular.confirmed && (
                  <motion.span
                    initial={reduceMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 520, damping: 24, duration: 0.2 }
                    }
                    className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white ring-2 ring-white dark:ring-gray-800"
                    aria-hidden
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </motion.span>
                )}
                <span className="sr-only">
                  {regular.confirmed
                    ? t('series.confirmedAria', { name })
                    : t('series.notConfirmedAria', { name })}
                </span>
              </li>
            );
          })}
          {overflow > 0 && (
            <li className="flex h-8 min-w-8 items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {`+${overflow}`}
            </li>
          )}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setConfirmSkipOpen(true)}
          disabled={!prompt.nextOccurrenceDate}
          className="min-h-[44px] rounded-lg px-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
        >
          {t('series.skipNext')}
        </button>
        <button
          type="button"
          onClick={onEditSeries}
          className="min-h-[44px] rounded-lg px-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/40"
        >
          {t('series.editSeries')}
        </button>
      </div>

      <ConfirmationModal
        isOpen={confirmSkipOpen}
        onClose={() => setConfirmSkipOpen(false)}
        onConfirm={handleSkip}
        title={t('series.skipNextTitle', { date: nextDateLabel })}
        message={t('series.skipNextBody')}
        confirmText={t('series.skipNextConfirm')}
        cancelText={t('common.cancel')}
        isLoading={skipping}
        tone="info"
      />
    </section>
  );
};
