import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarPlus, ChevronRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Drawer, DrawerCloseButton, DrawerContent } from '@/components/ui/Drawer';
import { TeamAvatar } from '@/components/TeamAvatar';
import { userTeamsApi, type UserTeamInvitableGame } from '@/api/userTeams';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { useAuthStore } from '@/store/authStore';
import type { Sport, UserTeam } from '@/types';
import { toastApiError } from '@/utils/toastApiError';
import { buildChallengeNavigationState, isChallengeGameOption } from '@/utils/userTeamChallenge';
import { UserTeamInvitableGameRow } from './UserTeamInvitableGameRow';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pair being challenged. */
  target: UserTeam;
  /** The viewer's complete pairs that may issue it (`challengerTeamsFor`); never empty. */
  challengerTeams: UserTeam[];
  /** Sport for a new match (leaderboard sport, else the viewer's primary). */
  sport?: Sport;
};

/**
 * Pair challenge: pick which of your pairs plays (when you have several), then
 * either open the create flow prefilled as a 2v2 with fixed teams, or drop the
 * challenge into a 2v2 game you are already in. Both end in the ordinary invite
 * — the challenged pair accepts or declines it like any game invite.
 */
export function ChallengeUserTeamSheet({ open, onOpenChange, target, challengerTeams, sport }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewerId = useAuthStore((s) => s.user?.id);
  const reduceMotion = usePrefersReducedMotion();
  const [challengerId, setChallengerId] = useState<string | null>(challengerTeams[0]?.id ?? null);
  const [games, setGames] = useState<UserTeamInvitableGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useBackButtonModal(open, () => onOpenChange(false), 'challenge-user-team');

  useEffect(() => {
    if (!challengerTeams.some((team) => team.id === challengerId)) {
      setChallengerId(challengerTeams[0]?.id ?? null);
    }
  }, [challengerId, challengerTeams]);

  const challenger = useMemo(
    () => challengerTeams.find((team) => team.id === challengerId) ?? null,
    [challengerId, challengerTeams],
  );

  const load = useCallback(async () => {
    if (!challengerId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await userTeamsApi.getInvitableGames(challengerId);
      setGames(data.filter(isChallengeGameOption));
    } catch (e: unknown) {
      setLoadError(true);
      toastApiError(t, e);
    } finally {
      setLoading(false);
    }
  }, [challengerId, t]);

  useEffect(() => {
    if (!open) return;
    setGames([]);
    void load();
  }, [open, load]);

  const startNewMatch = () => {
    if (!challenger || !viewerId) return;
    onOpenChange(false);
    navigate('/create-game', { state: buildChallengeNavigationState(viewerId, challenger, target, sport) });
  };

  const challengeInGame = async (gameId: string) => {
    if (!challenger || submittingId) return;
    setSubmittingId(gameId);
    try {
      await userTeamsApi.challenge(target.id, { gameId, challengerTeamId: challenger.id });
      toast.success(t('teams.challenge.sent', { name: target.name }));
      onOpenChange(false);
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setSubmittingId(null);
    }
  };

  const showInitialSpinner = loading && games.length === 0 && !loadError;
  const empty = !loading && !loadError && games.length === 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-h-[92dvh] overflow-hidden rounded-t-[32px] border-x border-t border-zinc-200/80 bg-zinc-50 text-zinc-950 shadow-[0_-24px_70px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b111b] dark:text-white"
        accessibleTitle={t('teams.challenge.title', { name: target.name })}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-zinc-300 dark:bg-white/20" aria-hidden />
        <DrawerCloseButton
          className="absolute right-4 top-3.5 z-20 bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/15"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        />
        <div
          data-testid="user-team-challenge-sheet"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10"
        >
          <h2 className="text-lg font-semibold tracking-tight [text-wrap:balance]">
            {t('teams.challenge.title', { name: target.name })}
          </h2>
          <p className="mt-1 text-sm leading-snug text-zinc-600 dark:text-zinc-400">{t('teams.challenge.hint')}</p>

          {challenger ? (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-[1.5rem] bg-white px-3 py-4 ring-1 ring-zinc-200/80 dark:bg-white/[0.04] dark:ring-white/10">
              <ChallengeSide team={challenger} />
              <motion.span
                key={challenger.id}
                initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-md shadow-amber-500/30"
              >
                {t('teams.challenge.vs')}
              </motion.span>
              <ChallengeSide team={target} />
            </div>
          ) : null}

          {challengerTeams.length > 1 ? (
            <div className="mt-4">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('teams.challenge.asTeam')}
              </p>
              <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup">
                {challengerTeams.map((team) => {
                  const selected = team.id === challengerId;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-testid="user-team-challenge-as"
                      onClick={() => setChallengerId(team.id)}
                      disabled={submittingId !== null}
                      className={`flex shrink-0 items-center gap-2 rounded-2xl py-1.5 pe-3 ps-1.5 text-sm font-semibold transition-[background-color,box-shadow,scale] duration-200 active:scale-[0.97] ${pressScaleGuard} ${
                        selected
                          ? 'bg-amber-500/15 text-amber-900 shadow-[inset_0_0_0_1.5px_rgb(245_158_11)] dark:text-amber-100'
                          : 'bg-white text-zinc-700 shadow-[inset_0_0_0_1px_rgb(228_228_231)] dark:bg-white/[0.04] dark:text-zinc-200 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]'
                      }`}
                    >
                      <TeamAvatar team={team} size="tile" showRing={false} participantTip={false} className="!h-8 !w-8 !rounded-xl" />
                      <span className="max-w-[9rem] truncate">{team.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            data-testid="user-team-challenge-new-match"
            onClick={startNewMatch}
            disabled={!challenger || submittingId !== null}
            className={`group mt-4 flex w-full items-center gap-3.5 rounded-[1.375rem] bg-zinc-900 px-4 py-3.5 text-start text-white shadow-lg shadow-zinc-900/20 outline-none transition-[background-color,scale] duration-200 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-amber-500/60 active:scale-[0.985] disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 ${pressScaleGuard}`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <CalendarPlus size={21} strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold tracking-tight">{t('teams.challenge.newMatch')}</span>
              <span className="mt-0.5 block text-xs leading-snug opacity-70">{t('teams.challenge.newMatchHint')}</span>
            </span>
            <ChevronRight
              size={20}
              className="shrink-0 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180"
              aria-hidden
            />
          </button>

          <div className="mt-6 flex items-center gap-2 px-1">
            <h3 className="text-sm font-semibold tracking-tight">{t('teams.challenge.existingTitle')}</h3>
            {loading && games.length > 0 ? (
              <Loader2 size={14} className="animate-spin text-amber-600" aria-hidden />
            ) : null}
          </div>
          {showInitialSpinner ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-amber-600" />
            </div>
          ) : loadError && games.length === 0 ? (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 w-full rounded-2xl bg-white py-3 text-sm font-semibold text-zinc-800 shadow-[inset_0_0_0_1px_rgb(228_228_231)] dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
            >
              {t('common.retry', { defaultValue: 'Retry' })}
            </button>
          ) : empty ? (
            <p className="mt-2 px-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('teams.challenge.existingEmpty')}
            </p>
          ) : (
            <div className="mt-2.5 flex flex-col gap-2">
              {games.map((game) => (
                <UserTeamInvitableGameRow
                  key={game.id}
                  game={game}
                  disabled={submittingId !== null}
                  submitting={submittingId === game.id}
                  onSelect={(id) => void challengeInGame(id)}
                />
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ChallengeSide({ team }: { team: UserTeam }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <TeamAvatar team={team} size="tile" showRing={false} participantTip={false} className="!h-14 !w-14 !rounded-[1.1rem]" />
      <span className="w-full truncate text-center text-sm font-semibold tracking-tight">{team.name}</span>
    </div>
  );
}
