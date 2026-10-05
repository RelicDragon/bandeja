import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Handshake, Trophy } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { usePairFormatters } from '@/components/pairs/pairFormat';
import { dynamicDuoProgress } from './dynamicDuoProgress';

/**
 * The pair's way up the Dynamic Duo ladder (10 / 50 / 100 padel match wins on
 * the same side). The count is the server's `duoMatchWins`, which applies the
 * exact rule the achievement grant uses — not the record's event `wins`.
 */
export function UserTeamDuoProgress({ wins }: { wins: number }) {
  const { t } = useTranslation();
  const formatters = usePairFormatters();
  const reduceMotion = usePrefersReducedMotion();
  const progress = dynamicDuoProgress(wins);
  const done = progress.target === null;
  const tierTitle = (threshold: number) => t(`trophies.defs.dynamicDuo${threshold}.title`);

  return (
    <div className="flex items-center gap-3" data-testid="user-team-duo-progress">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          done
            ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-md shadow-amber-500/30'
            : 'bg-primary-500/10 text-primary-600 dark:bg-primary-400/10 dark:text-primary-300'
        }`}
        aria-hidden
      >
        {done ? <Trophy size={19} strokeWidth={2} /> : <Handshake size={19} strokeWidth={2} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {done ? tierTitle(progress.reached!) : tierTitle(progress.target!)}
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
            {done
              ? t('teams.duoProgress.earned')
              : t('teams.duoProgress.count', {
                  wins: formatters.count(progress.wins),
                  target: formatters.count(progress.target!),
                })}
          </span>
        </div>

        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          role="meter"
          aria-label={t('teams.duoProgress.label')}
          aria-valuemin={0}
          aria-valuemax={progress.target ?? progress.wins}
          aria-valuenow={progress.wins}
        >
          <motion.div
            className={`h-full origin-left rounded-full rtl:origin-right ${
              done
                ? 'bg-gradient-to-r from-amber-400 to-amber-300'
                : 'bg-gradient-to-r from-primary-500 to-primary-400'
            }`}
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: Math.max(0, Math.min(1, progress.fraction)) }}
            transition={{ type: 'spring', stiffness: 120, damping: 22, delay: 0.25 }}
          />
        </div>

        <p className="mt-1 text-[11px] leading-snug text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
          {done ? t('teams.duoProgress.doneHint') : t('teams.duoProgress.hint')}
        </p>
      </div>
    </div>
  );
}
