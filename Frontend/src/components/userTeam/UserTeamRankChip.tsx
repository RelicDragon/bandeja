import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Medal } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { usePairFormatters } from '@/components/pairs/pairFormat';
import { heroGlass } from './heroGlass';
import { useUserTeamPairDetail } from './useUserTeamPairDetail';

/** `location.state` the Pairs board reads to scroll to and flash one pair. */
export type PairLeaderboardFocusState = { focusPairId?: string };

/**
 * "#4 pair in Belgrade" under the team name. The rank is the pair's row on the
 * board the Pairs tab opens with (viewer's city, all time, win rate), so the tap
 * lands on the same number. Renders nothing while loading or when unranked.
 */
export function UserTeamRankChip({ userAId, userBId }: { userAId: string; userBId: string | null | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setLeaderboardMode = useHeaderStore((s) => s.setLeaderboardMode);
  const { translateCity } = useTranslatedGeo();
  const formatters = usePairFormatters();
  const reduceMotion = usePrefersReducedMotion();
  const { pairId, query } = useUserTeamPairDetail(userAId, userBId);
  const rank = query.data?.cityRank ?? null;

  const city = user?.currentCity;
  const cityName =
    rank && city && city.id === rank.cityId ? translateCity(city.id, city.name, city.country) : null;

  const open = () => {
    if (!pairId) return;
    setLeaderboardMode('pairs');
    const state: PairLeaderboardFocusState = { focusPairId: pairId };
    navigate('/leaderboard', { state });
  };

  return (
    <AnimatePresence initial={false}>
      {rank ? (
        <motion.div
          key="rank"
          className="mt-2.5 flex justify-center"
          initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28 }}
        >
          <button
            type="button"
            data-testid="user-team-rank-chip"
            onClick={open}
            className={`inline-flex min-h-[2rem] items-center gap-1.5 rounded-full py-1 pe-2 ps-2.5 text-xs font-semibold text-zinc-800 outline-none transition-[background-color,scale] duration-200 hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] dark:text-zinc-100 dark:hover:bg-white/[0.12] ${heroGlass} ${pressScaleGuard}`}
          >
            <Medal
              size={14}
              strokeWidth={2.25}
              className={rank.rank <= 3 ? 'text-amber-500 dark:text-amber-300' : 'text-primary-600 dark:text-primary-300'}
              aria-hidden
            />
            <span className="tabular-nums">
              {cityName
                ? t('teams.rankChip', { rank: formatters.count(rank.rank), city: cityName })
                : t('teams.rankChipNoCity', { rank: formatters.count(rank.rank) })}
            </span>
            <ChevronRight size={14} className="text-zinc-400 rtl:rotate-180 dark:text-zinc-500" aria-hidden />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
