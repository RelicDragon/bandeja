import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { pairsApi, type PairRivalry } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import { PairAvatars } from '@/components/pairs/PairAvatars';
import { memberDisplayName, pairDisplayName, usePairFormatters } from '@/components/pairs/pairFormat';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { userTeamColorTones } from '@/utils/userTeamColor';
import type { BasicUser, Sport } from '@/types';
import { buildRivalryRematchState } from './rivalryRematch';

export interface UserTeamRivalriesProps {
  userAId: string;
  userBId: string;
  viewerId: string;
  /** The team's two players, for the rematch invites. */
  teamMembers: readonly BasicUser[];
  /** Only an accepted member can start a rematch. */
  canRematch: boolean;
  sport?: Sport;
}

const SURFACE =
  'rounded-[1.75rem] bg-[var(--ui-surface)] ring-1 ring-black/[0.04] shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)] dark:ring-white/[0.06]';

function TeamSwatch({ color }: { color: string | null }) {
  const tones = userTeamColorTones(color);
  return (
    <span
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${tones ? '' : 'bg-primary-500'}`}
      style={tones ? { backgroundImage: `linear-gradient(135deg, ${tones.light}, ${tones.dark})` } : undefined}
    />
  );
}

/**
 * The opposing pairs these two have faced most (top 3), with the match W–L
 * against each and a **Rematch** that opens the create flow with all four
 * players invited. Reads the same `pairs.detail` query as `UserTeamRecord`, so
 * it costs no extra request.
 */
export function UserTeamRivalries({
  userAId,
  userBId,
  viewerId,
  teamMembers,
  canRematch,
  sport,
}: UserTeamRivalriesProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formatters = usePairFormatters();
  const reduceMotion = usePrefersReducedMotion();
  const pairId = userAId !== userBId ? [userAId, userBId].sort().join(',') : null;

  const { data } = useQuery({
    queryKey: queryKeys.pairs.detail(pairId ?? '', sport),
    queryFn: () => pairsApi.getPair(pairId!, sport),
    enabled: Boolean(pairId),
    staleTime: 60 * 1000,
  });

  const rivalries = data?.rivalries ?? [];
  if (!pairId || rivalries.length === 0) return null;

  const rematch = (rivalry: PairRivalry) => {
    const go = () =>
      navigate('/create-game', {
        state: buildRivalryRematchState({ viewerId, teamMembers, rivalry }),
      });
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(go);
      return;
    }
    go();
  };

  return (
    <section
      className={`${SURFACE} px-2 pb-2 pt-4`}
      aria-labelledby="user-team-rivalries-title"
      data-testid="user-team-rivalries"
    >
      <header className="px-3 pb-2">
        <h2
          id="user-team-rivalries-title"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          {t('teams.rivalries.title')}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t('teams.rivalries.subtitle')}</p>
      </header>

      <ol>
        {rivalries.map((rivalry, index) => {
          const names = pairDisplayName(memberDisplayName(rivalry.userA), memberDisplayName(rivalry.userB));
          const title = rivalry.team?.name ?? names;
          const meetings = t('teams.rivalries.meetings', { count: rivalry.meetings });
          const leading = rivalry.wins > rivalry.losses;
          const trailing = rivalry.wins < rivalry.losses;
          return (
            <motion.li
              key={rivalry.pairId}
              data-testid="user-team-rivalry"
              className={`flex min-h-[4rem] items-center gap-3 px-3 py-2.5 ${
                index > 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : ''
              }`}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.05 * index }}
            >
              <PairAvatars userA={rivalry.userA} userB={rivalry.userB} size={38} overlap={12} />

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  {rivalry.team ? <TeamSwatch color={rivalry.team.color} /> : null}
                  <span className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {title}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {rivalry.team ? `${names} · ${meetings}` : meetings}
                </div>
              </div>

              <div
                className="shrink-0 text-base font-bold tabular-nums tracking-tight"
                aria-label={t('teams.rivalries.recordAria', {
                  wins: formatters.count(rivalry.wins),
                  losses: formatters.count(rivalry.losses),
                })}
                data-testid="user-team-rivalry-record"
              >
                <span
                  className={
                    leading ? 'text-green-600 dark:text-green-400' : 'text-zinc-900 dark:text-zinc-50'
                  }
                >
                  {formatters.count(rivalry.wins)}
                </span>
                <span className="px-0.5 text-zinc-300 dark:text-zinc-600">–</span>
                <span
                  className={trailing ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-50'}
                >
                  {formatters.count(rivalry.losses)}
                </span>
              </div>

              {canRematch ? (
                <button
                  type="button"
                  onClick={() => rematch(rivalry)}
                  aria-label={t('teams.rivalries.rematchAria', { names })}
                  data-testid="user-team-rivalry-rematch"
                  className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary-600/10 px-3 text-xs font-semibold text-primary-700 outline-none transition-[background-color,scale] duration-150 hover:bg-primary-600/15 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.96] dark:bg-primary-400/15 dark:text-primary-200 dark:hover:bg-primary-400/20 ${pressScaleGuard}`}
                >
                  <RotateCcw size={13} strokeWidth={2.25} aria-hidden />
                  {t('teams.rivalries.rematch')}
                </button>
              ) : null}
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
