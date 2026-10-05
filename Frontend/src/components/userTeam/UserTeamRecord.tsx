import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, Minus, Swords } from 'lucide-react';
import { pairsApi } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { ChemistryChip } from '@/components/pairs/ChemistryChip';
import { PairRecentGameCard } from '@/components/pairs/PairRecentGameCard';
import { usePairFormatters } from '@/components/pairs/pairFormat';
import type { Sport } from '@/types';
import { UserTeamPairStreak } from './UserTeamPairStreak';

export interface UserTeamRecordProps {
  userAId: string;
  userBId: string | null | undefined;
  sport?: Sport;
}

const SURFACE =
  'rounded-[1.75rem] bg-[var(--ui-surface)] ring-1 ring-black/[0.04] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)] dark:ring-white/[0.06]';

/**
 * PRD 352 — the pair's shared record on `/user-team/:id`: wins out of games,
 * a win-rate bar, chemistry and the recent form, then the shared games.
 *
 * Uses the same `pairs.detail` query as the pair sheet, so a formal team and an
 * informal duo report identical numbers. Non-wins can include ties, so the card
 * never claims a "losses" count it cannot back.
 */
export const UserTeamRecord = ({ userAId, userBId, sport }: UserTeamRecordProps) => {
  const { t } = useTranslation();
  const formatters = usePairFormatters();
  const reduceMotion = usePrefersReducedMotion();
  const pairId = userBId && userAId !== userBId ? [userAId, userBId].sort().join(',') : null;

  const query = useQuery({
    queryKey: queryKeys.pairs.detail(pairId ?? '', sport),
    queryFn: () => pairsApi.getPair(pairId!, sport),
    enabled: Boolean(pairId),
    staleTime: 60 * 1000,
  });

  if (!pairId) return null;

  if (query.isLoading) {
    return (
      <div className={`${shimmerBlock} h-40 w-full rounded-[1.75rem]`} role="status" aria-label={t('pairs.loading')} />
    );
  }

  const detail = query.data;
  if (!detail) return null;

  if (detail.games === 0) {
    return (
      <section className={`${SURFACE} flex items-center gap-3.5 px-4 py-4`} data-testid="user-team-record-empty">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
          <Swords size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{t('teams.recordTitle')}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-zinc-500 dark:text-zinc-400 [text-wrap:pretty]">
            {t('teams.recordEmpty')}
          </p>
        </div>
      </section>
    );
  }

  const rate = Math.max(0, Math.min(100, detail.winRate));
  // Oldest → newest, so the strip reads like a timeline ending at "now".
  const form = [...detail.recentGames].reverse();

  return (
    <div className="space-y-3">
      <section className={`${SURFACE} px-5 pb-4 pt-4`} data-testid="user-team-record">
        <header className="flex min-h-[2.75rem] items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{t('teams.recordTitle')}</h2>
          <ChemistryChip userAId={detail.userA.id} userBId={detail.userB.id} chemistry={detail.chemistry} />
        </header>

        <UserTeamPairStreak streak={detail.streak} className="mb-3" />

        <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-end gap-4">
          <div>
            <div className="text-[2.5rem] font-bold leading-none tracking-tight text-zinc-900 tabular-nums dark:text-white">
              {formatters.count(detail.wins)}
            </div>
            <div className="mt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('teams.wins')}</div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 text-center text-lg font-bold leading-none tracking-tight text-primary-600 tabular-nums dark:text-primary-400">
              {formatters.percent(rate)}
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
              role="meter"
              aria-label={t('pairs.stats.winRate')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(rate)}
            >
              <motion.div
                className="h-full origin-left rounded-full bg-gradient-to-r from-primary-500 to-primary-400 rtl:origin-right"
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: rate / 100 }}
                transition={{ type: 'spring', stiffness: 120, damping: 22, delay: 0.15 }}
              />
            </div>
            <div className="mt-1.5 truncate text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t('pairs.stats.winRate')}
            </div>
          </div>

          <div className="text-end">
            <div className="text-[2.5rem] font-bold leading-none tracking-tight text-zinc-300 tabular-nums dark:text-zinc-600">
              {formatters.count(detail.games)}
            </div>
            <div className="mt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('pairs.stats.games')}</div>
          </div>
        </div>

        {form.length > 0 ? (
          <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('pairs.sheet.recent')}</span>
            <ol className="flex items-center gap-1.5">
              {form.map((g) => (
                <li
                  key={g.id}
                  title={g.won ? t('pairs.result.win') : t('pairs.result.loss')}
                  className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                    g.won
                      ? 'bg-green-500/15 text-green-700 dark:bg-green-400/15 dark:text-green-300'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  <span className="sr-only">{g.won ? t('pairs.result.win') : t('pairs.result.loss')}</span>
                  {g.won ? (
                    <Check size={13} strokeWidth={3} aria-hidden />
                  ) : (
                    <Minus size={13} strokeWidth={3} aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {detail.recentGames.length > 0 ? (
        <ul className="space-y-2" aria-label={t('pairs.sheet.recent')}>
          {detail.recentGames.map((game) => (
            <li key={game.id}>
              <PairRecentGameCard game={game} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
