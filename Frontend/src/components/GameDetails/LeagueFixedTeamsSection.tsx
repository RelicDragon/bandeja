import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { useState } from 'react';
import type { BasicUser, Game, GameTeam } from '@/types';
import { DEFAULT_SPORT } from '@shared/sport';
import { useAuthStore } from '@/store/authStore';
import { useSportLevelContext } from '@/contexts/useSportLevelContext';
import { resolveLeagueGameCardTeams } from '@/utils/leagueGameCardTeams.util';
import { resolveLeagueGameCardWinner } from '@/utils/leagueGameCardWinner.util';
import {
  formatLevelChange,
  levelBalance,
  levelChangeByUserId,
  teamAverageLevel,
} from '@/utils/leagueFixedTeamsMatchup.util';

type Side = 'teamA' | 'teamB';
type Phase = 'upcoming' | 'live' | 'final';

/* Blue corner / pink corner: each side keeps one accent through stripe, glow, label and bar. */
const ACCENT: Record<
  Side,
  { glow: string; stripe: string; label: string; bar: string; winRow: string; avatarRing: string }
> = {
  teamA: {
    glow: 'bg-sky-400/25 dark:bg-sky-500/20',
    stripe: 'from-sky-400 to-cyan-300',
    label: 'text-sky-700 dark:text-sky-300',
    bar: 'from-sky-400 to-cyan-300',
    winRow: 'bg-sky-50/80 ring-sky-300/70 dark:bg-sky-400/[0.07] dark:ring-sky-300/40',
    avatarRing: 'ring-sky-300/80 dark:ring-sky-400/50',
  },
  teamB: {
    glow: 'bg-rose-400/25 dark:bg-fuchsia-500/20',
    stripe: 'from-fuchsia-400 to-rose-400',
    label: 'text-rose-700 dark:text-fuchsia-300',
    bar: 'from-fuchsia-400 to-rose-400',
    winRow: 'bg-rose-50/80 ring-rose-300/70 dark:bg-fuchsia-400/[0.07] dark:ring-fuchsia-300/40',
    avatarRing: 'ring-rose-300/80 dark:ring-fuchsia-400/50',
  },
};

/** Explicit fixture name first (organizer-set or copied at pairing), then the pair's own team. */
function teamIdentity(team: GameTeam | undefined): { name: string | null; avatar: string | null } {
  const name = team?.name?.trim() || team?.userTeam?.name?.trim() || null;
  return { name, avatar: team?.userTeam?.avatar || null };
}

function fullName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

function LevelDelta({ change }: { change: number | undefined }) {
  const text = change === undefined ? null : formatLevelChange(change);
  if (!text) return null;
  return (
    <span
      className={`shrink-0 rounded-md px-1 text-[10px] font-bold tabular-nums ${
        change! > 0
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-red-500/15 text-red-700 dark:text-red-300'
      }`}
    >
      {text}
    </span>
  );
}

function TeamRow({
  side,
  label,
  isNamed,
  teamAvatar,
  players,
  isMine,
  avgLevel,
  levelChanges,
  isWinner,
  isLoser,
}: {
  side: Side;
  label: string;
  /** A real team name reads as a title; the "Team 1" fallback stays a small eyebrow. */
  isNamed: boolean;
  teamAvatar: string | null;
  players: BasicUser[];
  isMine: boolean;
  avgLevel: number | null;
  levelChanges: Map<string, number> | null;
  isWinner: boolean;
  isLoser: boolean;
}) {
  const { t } = useTranslation();
  const accent = ACCENT[side];
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const showTeamAvatar = teamAvatar !== null && teamAvatar !== failedAvatar;

  return (
    <div
      className={`relative rounded-2xl py-3 pe-3 ps-4 transition-all duration-300 ${
        isWinner ? `ring-1 ${accent.winRow}` : ''
      } ${isLoser ? 'opacity-55 saturate-[0.35]' : ''}`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-3 start-0 w-1 rounded-full bg-gradient-to-b ${accent.stripe}`}
      />

      <div className="flex min-w-0 items-center gap-2">
        {showTeamAvatar && teamAvatar && (
          <img
            src={teamAvatar}
            alt=""
            onError={() => setFailedAvatar(teamAvatar)}
            className={`h-7 w-7 shrink-0 rounded-full bg-gray-200 object-cover ring-2 dark:bg-gray-800 ${accent.avatarRing}`}
          />
        )}
        <span
          className={`min-w-0 truncate ${
            isNamed
              ? 'text-sm font-extrabold tracking-tight text-gray-900 dark:text-white'
              : `text-[10px] font-bold uppercase tracking-[0.14em] ${accent.label}`
          }`}
        >
          {label}
        </span>
        {isMine && (
          <span className="shrink-0 rounded-full bg-gray-900/[0.06] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {t('gameDetails.matchupYourTeam')}
          </span>
        )}
        <span className="ms-auto flex shrink-0 items-center gap-1.5">
          {isWinner && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-950 shadow-sm shadow-amber-500/30">
              <Trophy size={9} strokeWidth={3} />
              {t('gameDetails.matchupWinner')}
            </span>
          )}
          {avgLevel !== null && (
            <span className="flex items-baseline gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('gameDetails.matchupAvgLevel')}
              </span>
              <span className="text-base font-black leading-none tabular-nums tracking-tight text-gray-900 dark:text-white">
                {avgLevel.toFixed(2)}
              </span>
            </span>
          )}
        </span>
      </div>

      <div className="mt-2.5 flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center gap-4 ps-1.5">
          {players.map((player) => (
            <PlayerAvatar
              key={player.id}
              player={player}
              draggable={false}
              fullHideName
              smallLayout
              removable={false}
            />
          ))}
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-1 ps-1">
          {players.map((player) => (
            <li key={player.id} className="flex min-w-0 items-center gap-1.5">
              <span
                className="min-w-0 truncate text-[13px] font-semibold leading-snug text-gray-900 dark:text-gray-50"
                title={fullName(player)}
              >
                {fullName(player)}
              </span>
              <LevelDelta change={levelChanges?.get(player.id)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function VsDivider({ phase, isTie }: { phase: Phase; isTie: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="relative z-10 -my-2 flex items-center" aria-hidden>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/40 to-sky-400/60" />
      <div className="mx-2 flex items-center gap-1.5">
        <div className="rounded-full bg-[conic-gradient(from_200deg,#38bdf8,#e879f9,#fb7185,#38bdf8)] p-[1.5px] shadow-lg shadow-fuchsia-500/25">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-gray-950">
            {phase === 'final' && !isTie ? (
              <Trophy size={15} className="text-amber-500 dark:text-amber-300" strokeWidth={2.25} />
            ) : phase === 'final' ? (
              <span className="text-sm font-black text-gray-700 dark:text-gray-200">=</span>
            ) : (
              <span className="bg-gradient-to-br from-sky-500 to-fuchsia-500 bg-clip-text pe-px text-[11px] font-black italic tracking-tight text-transparent dark:from-sky-300 dark:to-fuchsia-300">
                {t('gameDetails.fixtureVsShort').toUpperCase()}
              </span>
            )}
          </div>
        </div>
        {phase === 'live' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-white shadow-sm shadow-red-500/40">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            {t('gameDetails.matchupLive')}
          </span>
        )}
        {phase === 'final' && isTie && (
          <span className="rounded-full bg-gray-900/[0.06] px-2 py-px text-[9px] font-bold uppercase tracking-wider text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {t('gameDetails.matchupDraw')}
          </span>
        )}
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-400/60 via-fuchsia-400/40 to-transparent" />
    </div>
  );
}

function LevelBalanceBar({ shareA, favoredLabel }: { shareA: number; favoredLabel: string | null }) {
  const { t } = useTranslation();
  const pctA = Math.round(shareA * 100);
  return (
    <div className="mt-3 px-1">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide">
        <span className="shrink-0 text-gray-500 dark:text-gray-400">{t('gameDetails.matchupLevelBalance')}</span>
        <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">
          {favoredLabel ? t('gameDetails.matchupEdge', { team: favoredLabel }) : t('gameDetails.matchupEven')}
        </span>
      </div>
      <div
        className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full"
        role="meter"
        aria-label={t('gameDetails.matchupLevelBalance')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctA}
      >
        <div className={`h-full rounded-s-full bg-gradient-to-r ${ACCENT.teamA.bar}`} style={{ width: `${pctA}%` }} />
        <div className={`h-full flex-1 rounded-e-full bg-gradient-to-r ${ACCENT.teamB.bar}`} />
      </div>
    </div>
  );
}

interface LeagueFixedTeamsSectionProps {
  game: Game;
}

export const LeagueFixedTeamsSection = ({ game }: LeagueFixedTeamsSectionProps) => {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const contextSport = useSportLevelContext();
  const sport = game.sport ?? contextSport ?? DEFAULT_SPORT;

  const { teamA, teamB } = resolveLeagueGameCardTeams(game);
  const sortedTeams = [...(game.fixedTeams ?? [])].sort((a, b) => a.teamNumber - b.teamNumber);
  const identityA = teamIdentity(sortedTeams[0]);
  const identityB = teamIdentity(sortedTeams[1]);
  const labelA = identityA.name ?? t('gameDetails.team1');
  const labelB = identityB.name ?? t('gameDetails.team2');

  const phase: Phase =
    game.resultsStatus === 'FINAL' ? 'final' : game.status === 'STARTED' ? 'live' : 'upcoming';
  const { winner, isTie } = resolveLeagueGameCardWinner(game);
  const levelChanges = phase === 'final' ? levelChangeByUserId(game.outcomes) : null;

  const avgA = teamAverageLevel(teamA, sport);
  const avgB = teamAverageLevel(teamB, sport);
  // After the result the trophy and level deltas tell the story; the pre-match edge is noise.
  const balance = phase === 'final' ? null : levelBalance(avgA, avgB);

  const mineA = !!userId && teamA.some((p) => p.id === userId);
  const mineB = !!userId && teamB.some((p) => p.id === userId);

  return (
    <section
      aria-label={`${labelA} ${t('gameDetails.fixtureVsShort')} ${labelB}`}
      className="relative mb-3 overflow-hidden rounded-3xl border border-gray-200/80 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-gray-900/80"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className={`absolute -left-20 -top-20 h-52 w-52 rounded-full blur-3xl ${ACCENT.teamA.glow}`} />
        <div className={`absolute -bottom-20 -right-20 h-52 w-52 rounded-full blur-3xl ${ACCENT.teamB.glow}`} />
      </div>

      <div className="relative">
        <TeamRow
          side="teamA"
          label={labelA}
          isNamed={identityA.name !== null}
          teamAvatar={identityA.avatar}
          players={teamA}
          isMine={mineA}
          avgLevel={avgA}
          levelChanges={levelChanges}
          isWinner={winner === 'teamA'}
          isLoser={winner === 'teamB'}
        />
        <VsDivider phase={phase} isTie={isTie} />
        <TeamRow
          side="teamB"
          label={labelB}
          isNamed={identityB.name !== null}
          teamAvatar={identityB.avatar}
          players={teamB}
          isMine={mineB}
          avgLevel={avgB}
          levelChanges={levelChanges}
          isWinner={winner === 'teamB'}
          isLoser={winner === 'teamA'}
        />
        {balance && (
          <div className="pb-1.5">
            <LevelBalanceBar
              shareA={balance.shareA}
              favoredLabel={balance.favored === 'teamA' ? labelA : balance.favored === 'teamB' ? labelB : null}
            />
          </div>
        )}
      </div>
    </section>
  );
};
