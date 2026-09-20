import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Loader2, Repeat } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { ClubAvatar } from '@/components/ClubAvatar';
import type { SeriesNextPrompt } from '@/api/series';
import { formatShortDate, formatShortDateTime } from './seriesFormat';
import { useRespondToNextOccurrence } from './useSeries';

/**
 * PRD 345 — the "Same time next week?" moment.
 *
 * Lives at the top of a finished occurrence's details and on Home's
 * MyGamesSection. **I'm in** morphs into a green check reading "You're in for
 * Tue 1 Oct", the card collapses 1.2 s later and a "Seat kept" toast fires.
 * **Skip** keeps the card but swaps the body for the footer note "Your seat
 * opens to others on …" — the PRD is explicit that declining asks nothing more.
 *
 * Reduced motion: no morph, no collapse animation; the confirmed state appears
 * immediately and the card is removed without a height tween.
 */

const COLLAPSE_DELAY_MS = 1200;

export interface SeriesNextWeekCardProps {
  prompt: SeriesNextPrompt;
  /** The finished occurrence this card is rendered on. */
  sourceGameId: string;
  clubName?: string | null;
  clubAvatarUrl?: string | null;
  onOpenSeries?: (seriesId: string) => void;
  className?: string;
}

type CardState = 'idle' | 'confirming' | 'confirmed' | 'declined' | 'hidden';

export const SeriesNextWeekCard = ({
  prompt,
  sourceGameId,
  clubName,
  clubAvatarUrl,
  onOpenSeries,
  className = '',
}: SeriesNextWeekCardProps) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const respond = useRespondToNextOccurrence();
  const [state, setState] = useState<CardState>(
    prompt.viewerIsPlaying ? 'hidden' : 'idle',
  );
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    },
    [],
  );

  const locale = i18n.language;
  const nextDateLabel = formatShortDate(prompt.nextStartTime, { locale });
  const nextDateTimeLabel = formatShortDateTime(prompt.nextStartTime, { locale });
  const seatDeadlineLabel = formatShortDate(prompt.seatDeadlineAt, { locale });

  const handleAccept = useCallback(async () => {
    setState('confirming');
    try {
      await respond.mutateAsync({
        nextGameId: prompt.nextGameId,
        action: 'accept',
        sourceGameId,
        seriesId: prompt.seriesId,
      });
      setState('confirmed');
      toast.success(t('series.seatKept'));
      collapseTimer.current = setTimeout(
        () => setState('hidden'),
        reduceMotion ? 0 : COLLAPSE_DELAY_MS,
      );
    } catch {
      setState('idle');
      toast.error(t('series.confirmError'));
    }
  }, [prompt.nextGameId, prompt.seriesId, reduceMotion, respond, sourceGameId, t]);

  const handleDecline = useCallback(async () => {
    setState('declined');
    try {
      await respond.mutateAsync({
        nextGameId: prompt.nextGameId,
        action: 'decline',
        sourceGameId,
        seriesId: prompt.seriesId,
      });
    } catch {
      // Declining records nothing server-side, so a failure changes no state
      // the user can see. Keep the note; do not shout about it.
    }
  }, [prompt.nextGameId, prompt.seriesId, respond, sourceGameId]);

  if (state === 'hidden') return null;

  const busy = state === 'confirming';

  return (
    <AnimatePresence initial={false}>
      <motion.section
        key="series-next-week"
        aria-label={t('series.nextWeekTitle')}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
        className={`overflow-hidden rounded-2xl border border-primary-200/70 bg-primary-50/70 p-3 dark:border-primary-500/25 dark:bg-primary-950/30 ${className}`.trim()}
      >
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            {clubName ? (
              <ClubAvatar
                club={{ id: prompt.seriesId, name: clubName, avatar: clubAvatarUrl ?? null }}
                className="h-10 w-10 rounded-xl"
              />
            ) : (
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300"
                aria-hidden
              >
                <Repeat className="h-5 w-5" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {t('series.nextWeekTitle')}
            </p>
            <p className="truncate text-xs text-gray-600 dark:text-gray-300">
              {nextDateTimeLabel}
              {prompt.nextClubName ? ` · ${prompt.nextClubName}` : ''}
            </p>
          </div>

          {state === 'confirmed' ? (
            <motion.p
              initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }
              }
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-3 py-2 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300"
            >
              <Check className="h-4 w-4" aria-hidden />
              <span>{t('series.youreIn', { date: nextDateLabel })}</span>
            </motion.p>
          ) : state === 'declined' ? null : (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleDecline}
                disabled={busy}
                className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-white/70 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
              >
                {t('series.skip')}
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={busy}
                aria-busy={busy}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    <span>{t('series.confirmPending')}</span>
                  </>
                ) : (
                  t('series.imIn')
                )}
              </button>
            </div>
          )}
        </div>

        {state === 'declined' && (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            {t('series.seatOpensOn', { date: seatDeadlineLabel })}
          </p>
        )}

        {onOpenSeries && state !== 'declined' && (
          <button
            type="button"
            onClick={() => onOpenSeries(prompt.seriesId)}
            className="mt-2 min-h-[44px] text-start text-xs font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
          >
            {t('series.partOf', { name: prompt.seriesName })}
          </button>
        )}
      </motion.section>
    </AnimatePresence>
  );
};
