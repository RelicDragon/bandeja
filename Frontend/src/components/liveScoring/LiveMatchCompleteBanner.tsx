import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import type { LiveScoringState } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { computeMatchWinnerLiveScoring } from '@/utils/scoring';

type LiveMatchCompleteBannerProps = {
  state: LiveScoringState;
  rules: ScoringRules;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  gameId: string;
  className?: string;
};

function playerLineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

function TeamWinnerRows({ players, emptyLabel }: { players: BasicUser[]; emptyLabel: string }) {
  const roster = players.length ? players : [null as BasicUser | null];
  return (
    <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
      {roster.map((p, i) => (
        <div
          key={p?.id ?? `empty-${i}`}
          className="flex min-w-0 items-center justify-center gap-3 rounded-xl bg-emerald-600/10 px-3 py-2 dark:bg-emerald-950/25"
        >
          <PlayerAvatar player={p} showName={false} extrasmall asDiv subscribePresence={false} />
          <span className="min-w-0 truncate text-sm font-semibold">{p ? playerLineName(p) : emptyLabel}</span>
        </div>
      ))}
    </div>
  );
}

export const LiveMatchCompleteBanner = ({
  state,
  rules,
  teamAPlayers,
  teamBPlayers,
  gameId,
  className,
}: LiveMatchCompleteBannerProps) => {
  const { t } = useTranslation();
  const winner = computeMatchWinnerLiveScoring(state.sets, rules);
  const emptyRoster = t('games.emptySlot');

  const draw = winner !== 'A' && winner !== 'B';
  const headline = draw
    ? t('gameDetails.liveScoring.matchCompleteDraw')
    : t('gameDetails.liveScoring.matchCompleteWinner');

  return (
    <div
      role="status"
      className={`flex w-full flex-col items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-100 ${className ?? ''}`}
    >
      <div className="text-xs uppercase tracking-wide opacity-80">{t('gameDetails.liveScoring.matchComplete')}</div>
      <div
        className={`text-base font-bold ${draw ? '' : 'uppercase tracking-[0.2em]'}`}
      >
        {headline}
      </div>
      {winner === 'A' ? (
        <TeamWinnerRows players={teamAPlayers} emptyLabel={emptyRoster} />
      ) : winner === 'B' ? (
        <TeamWinnerRows players={teamBPlayers} emptyLabel={emptyRoster} />
      ) : (
        <div className="mt-2 flex w-full max-w-md flex-col gap-4 sm:flex-row sm:justify-center sm:gap-6">
          <div className="flex flex-col items-center">
            <div className="mb-1 text-xs font-medium opacity-80">{t('gameDetails.liveScoring.teamBenchA')}</div>
            <TeamWinnerRows players={teamAPlayers} emptyLabel={emptyRoster} />
          </div>
          <div className="flex flex-col items-center">
            <div className="mb-1 text-xs font-medium opacity-80">{t('gameDetails.liveScoring.teamBenchB')}</div>
            <TeamWinnerRows players={teamBPlayers} emptyLabel={emptyRoster} />
          </div>
        </div>
      )}
      {gameId ? (
        <Link
          to={`/games/${encodeURIComponent(gameId)}`}
          className="text-xs font-semibold text-emerald-900 underline underline-offset-2 hover:opacity-80 dark:text-emerald-100"
        >
          {t('gameDetails.liveScoring.viewResults')}
        </Link>
      ) : null}
    </div>
  );
};
