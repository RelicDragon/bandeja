import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import type { PlayStreakView } from '@/types/playStreak';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type Props = {
  /** `pairs.detail` → `streak`. Absent on older servers: renders nothing. */
  streak: PlayStreakView | undefined;
  className?: string;
};

function formatDeadline(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
  } catch {
    return null;
  }
}

/**
 * Weekly pair streak on `/user-team/:id`: "6 weeks in a row" as a flame chip.
 *
 * Same rules as the solo play streak (a rated game every 7 days), counted only
 * on games the two played on the same side. `atRisk` comes from the server and
 * is only ever true for a member of the pair, inside the last 48 hours before
 * the deadline — the same window the solo chip pulses in.
 */
export function UserTeamPairStreak({ streak, className = '' }: Props) {
  const { t, i18n } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  if (!streak || streak.current <= 0) return null;

  const atRisk = streak.atRisk;
  const deadline = atRisk ? formatDeadline(streak.deadlineAt, i18n.language) : null;
  const showBest = streak.best > streak.current;

  return (
    <motion.div
      data-testid="user-team-streak"
      className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 ${className}`.trim()}
      initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26, delay: 0.1 }}
    >
      <span
        title={t('teams.streak.rules')}
        aria-label={`${t('teams.streak.title')}: ${t('teams.streak.chip', { count: streak.current })}`}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
          atRisk
            ? `bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100 ${reduceMotion ? '' : 'animate-pulse'}`
            : 'bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-100'
        }`}
      >
        <Flame size={14} className="fill-orange-500 text-orange-500" aria-hidden />
        {t('teams.streak.chip', { count: streak.current })}
      </span>
      {showBest ? (
        <span className="text-xs font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
          {t('teams.streak.best', { count: streak.best })}
        </span>
      ) : null}
      {atRisk && deadline ? (
        <p
          data-testid="user-team-streak-at-risk"
          className="w-full text-xs leading-snug text-amber-800 [text-wrap:pretty] dark:text-amber-200/90"
        >
          {t('teams.streak.atRisk', { date: deadline })}
        </p>
      ) : null}
    </motion.div>
  );
}
