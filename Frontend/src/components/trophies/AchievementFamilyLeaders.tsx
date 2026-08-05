import { useTranslation } from 'react-i18next';
import { Medal } from 'lucide-react';
import {
  achievementLeaderboardFamilyForRuleKind,
} from '@shared/achievements';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useAchievementLeaderboardQuery } from '@/queries/useAchievementLeaderboardQuery';
import type { AchievementLeaderboardEntry } from '@/api/ranking';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';

type AchievementFamilyLeadersProps = {
  ruleKind: string;
  open: boolean;
};

const RANK_CLASS: Record<number, string> = {
  1: 'bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950 ring-amber-300/70 shadow-amber-500/30',
  2: 'bg-gradient-to-br from-slate-100 to-slate-400 text-slate-800 ring-slate-300/70 shadow-slate-400/30',
  3: 'bg-gradient-to-br from-orange-200 to-orange-500 text-orange-950 ring-orange-300/70 shadow-orange-500/30',
};

const LEADER_CLASS: Record<number, string> = {
  1: 'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-yellow-50 shadow-amber-500/10 hover:border-amber-300 dark:border-amber-400/20 dark:from-amber-400/12 dark:via-white/[0.06] dark:to-yellow-400/8',
  2: 'border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-gray-50 shadow-slate-500/10 hover:border-slate-300 dark:border-slate-300/15 dark:from-slate-300/10 dark:via-white/[0.06] dark:to-slate-400/8',
  3: 'border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-amber-50 shadow-orange-500/10 hover:border-orange-300 dark:border-orange-400/20 dark:from-orange-400/10 dark:via-white/[0.06] dark:to-amber-400/8',
};

export function AchievementFamilyLeaders({
  ruleKind,
  open,
}: AchievementFamilyLeadersProps) {
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();
  const family = achievementLeaderboardFamilyForRuleKind(ruleKind);
  const query = useAchievementLeaderboardQuery({
    family: open ? family : null,
    scope: 'global',
    gender: 'all',
  });

  if (!open || !family || query.isError) return null;

  const leaders = query.data?.leaderboard.slice(0, 3) ?? [];
  if (!query.isPending && leaders.length === 0) return null;

  return (
    <section
      data-testid="achievement-family-leaders"
      className="space-y-2.5 rounded-2xl border border-gray-200/70 bg-gradient-to-b from-gray-50/90 to-white p-3 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.7)] dark:border-white/10 dark:from-white/[0.055] dark:to-white/[0.025]"
      aria-label={t('trophies.detail.familyLeaders')}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-100 text-amber-600 ring-1 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20">
          <Medal className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-xs font-bold tracking-tight text-gray-700 dark:text-gray-200">
          {t('trophies.detail.familyLeaders')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {query.isPending
          ? [1, 2, 3].map((rank) => (
              <span
                key={rank}
                className="h-12 w-32 animate-pulse rounded-2xl bg-gray-200/70 dark:bg-white/[0.07]"
              />
            ))
          : leaders.map((leader: AchievementLeaderboardEntry) => {
              const fullName = [leader.firstName, leader.lastName]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={leader.id}
                  type="button"
                  className={`group relative flex min-h-12 max-w-48 items-center gap-2 overflow-hidden rounded-2xl border px-2.5 py-2 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${LEADER_CLASS[leader.rank] ?? 'border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.05]'}`}
                  aria-label={`${leader.rank}. ${fullName}`}
                  onClick={() => openPlayerCard(leader.id)}
                >
                  <span
                    className="pointer-events-none absolute -right-4 -top-5 h-12 w-12 rounded-full bg-white/70 blur-xl transition-transform duration-300 group-hover:scale-150 dark:bg-white/10"
                    aria-hidden
                  />
                  <span
                    className={`relative flex h-7 min-w-7 shrink-0 items-center justify-center rounded-xl px-1 text-[11px] font-black tabular-nums shadow-md ring-1 ${RANK_CLASS[leader.rank] ?? 'bg-gray-200 text-gray-700 ring-gray-300/40 dark:bg-gray-600 dark:text-gray-100'}`}
                  >
                    #{leader.rank}
                  </span>
                  <PlayerAvatar
                    player={leader}
                    showName={false}
                    inlineFace
                    inlineFaceSize="md"
                    extrasmall
                    asDiv
                  />
                  <span className="relative truncate whitespace-nowrap text-xs font-bold text-gray-900 dark:text-gray-50">
                    {formatFixtureMatrixPlayerName(leader)}
                  </span>
                </button>
              );
            })}
      </div>
    </section>
  );
}
