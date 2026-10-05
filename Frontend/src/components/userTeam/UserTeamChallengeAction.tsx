import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Swords } from 'lucide-react';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { useAuthStore } from '@/store/authStore';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import type { Sport, UserTeam } from '@/types';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { acceptedMemberIds, challengerTeamsFor } from '@/utils/userTeamChallenge';
import { ChallengeUserTeamSheet } from './ChallengeUserTeamSheet';

type Props = {
  /** The pair on screen — shown only when it is complete and not the viewer's. */
  team: UserTeam;
  sport?: Sport;
  disabled?: boolean;
};

/**
 * "Challenge" on another pair's page. Dark card with an amber mark so it never
 * reads as the page's blue primary action or as a Rematch row. Renders nothing
 * unless the viewer has a complete pair that shares no player with this one.
 */
export function UserTeamChallengeAction({ team, sport, disabled }: Props) {
  const { t } = useTranslation();
  const viewerId = useAuthStore((s) => s.user?.id);
  const teams = useUserTeamsStore((s) => s.teams);
  const memberships = useUserTeamsStore((s) => s.memberships);
  const refreshAll = useUserTeamsStore((s) => s.refreshAll);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const targetIds = acceptedMemberIds(team);
  const targetReady = targetIds.length >= team.size;
  const targetKey = targetIds.join(',');
  const challengerTeams = useMemo(
    () => challengerTeamsFor(viewerId, memberships, teams, targetKey ? targetKey.split(',') : []),
    [memberships, targetKey, teams, viewerId],
  );

  if (!targetReady || challengerTeams.length === 0) return null;

  return (
    <>
      <button
        type="button"
        data-testid="user-team-challenge"
        onClick={() => runWithProfileName(() => setOpen(true))}
        disabled={disabled}
        className={`group relative flex w-full items-center gap-3.5 overflow-hidden rounded-[1.375rem] bg-zinc-900 px-4 py-3.5 text-start text-white shadow-lg shadow-zinc-900/25 outline-none transition-[background-color,scale] duration-200 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-2 active:scale-[0.985] disabled:opacity-60 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard}`}
      >
        <span
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_130%_at_100%_0%,rgba(245,158,11,0.28),transparent_55%)]"
          aria-hidden
        />
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
          <Swords size={21} strokeWidth={2} aria-hidden />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight">{t('teams.challenge.action')}</span>
          <span className="mt-0.5 block text-xs leading-snug text-white/70">
            {challengerTeams.length === 1
              ? t('teams.challenge.actionDetail', { name: challengerTeams[0]!.name })
              : t('teams.challenge.actionDetailPick')}
          </span>
        </span>
        <ChevronRight
          size={20}
          className="relative shrink-0 text-white/60 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
          aria-hidden
        />
      </button>

      <ChallengeUserTeamSheet
        open={open}
        onOpenChange={setOpen}
        target={team}
        challengerTeams={challengerTeams}
        sport={sport}
      />
    </>
  );
}
