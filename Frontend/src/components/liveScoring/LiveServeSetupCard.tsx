import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import { PlayerAvatar } from '@/components';
import type { LiveTeamSide } from '@/utils/liveScoring';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

type LiveServeSetupCardProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  saving?: boolean;
  onComplete: (side: LiveTeamSide, doublesPlayerIndex: number) => void;
  onSkipHints: () => void;
};

export const LiveServeSetupCard = ({
  teamAPlayers,
  teamBPlayers,
  saving,
  onComplete,
  onSkipHints,
}: LiveServeSetupCardProps) => {
  const { t } = useTranslation();
  const [side, setSide] = useState<LiveTeamSide | null>(null);
  const [doublesIdx, setDoublesIdx] = useState(0);

  const roster = side === 'teamA' ? teamAPlayers : side === 'teamB' ? teamBPlayers : [];
  const doubles = roster.length >= 2;

  const submit = () => {
    if (!side) return;
    onComplete(side, doubles ? doublesIdx : 0);
  };

  const teamBlock = (which: LiveTeamSide, players: BasicUser[]) => {
    const sel = side === which;
    return (
      <button
        type="button"
        className={`flex w-full min-w-0 flex-col items-center gap-2 rounded-xl border py-3 text-left ${
          sel ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/40' : 'border-gray-300 dark:border-gray-700'
        }`}
        onClick={() => {
          setSide(which);
          setDoublesIdx(0);
        }}
      >
        <div className="px-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {which === 'teamA' ? t('gameDetails.liveScoring.teamBenchA') : t('gameDetails.liveScoring.teamBenchB')}
        </div>
        <div className="flex w-full justify-center px-2">
          <div className="inline-flex max-w-full min-w-0 flex-col gap-1.5">
            {(players.length ? players : [null]).map((p, i) => (
              <div key={p?.id ?? `e-${which}-${i}`} className="flex w-full min-w-0 items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <PlayerAvatar player={p} showName={false} extrasmall asDiv subscribePresence={false} />
                </div>
                <span className="min-w-0 flex-1 truncate text-left text-xs font-medium">{p ? lineName(p) : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="rounded-3xl border border-primary-200 bg-primary-50/40 p-4 dark:border-primary-900 dark:bg-primary-950/30">
      <div className="text-center text-sm font-bold text-gray-900 dark:text-gray-100">
        {t('gameDetails.liveScoring.serveSetupTitle')}
      </div>
      <p className="mt-1 text-center text-xs text-gray-600 dark:text-gray-400">{t('gameDetails.liveScoring.serveSetupSubtitle')}</p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {teamBlock('teamA', teamAPlayers)}
        {teamBlock('teamB', teamBPlayers)}
      </div>
      {side && doubles ? (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('gameDetails.liveScoring.whichDoublesPlayer')}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={`rounded-xl border py-2 text-sm font-bold ${
                doublesIdx === 0 ? 'border-primary-600 bg-white dark:bg-gray-900' : 'border-gray-300 dark:border-gray-700'
              }`}
              onClick={() => setDoublesIdx(0)}
            >
              {lineName(roster[0]!)}
            </button>
            <button
              type="button"
              className={`rounded-xl border py-2 text-sm font-bold ${
                doublesIdx === 1 ? 'border-primary-600 bg-white dark:bg-gray-900' : 'border-gray-300 dark:border-gray-700'
              }`}
              onClick={() => setDoublesIdx(1)}
            >
              {lineName(roster[1]!)}
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="mt-4 w-full rounded-2xl bg-primary-600 py-3 text-sm font-black text-white disabled:opacity-40"
        disabled={!side || saving}
        onClick={submit}
      >
        {t('gameDetails.liveScoring.confirmStart')}
      </button>
      <button type="button" className="mt-2 w-full text-xs text-gray-500 underline dark:text-gray-400" onClick={onSkipHints}>
        {t('gameDetails.liveScoring.skipServeHints')}
      </button>
    </div>
  );
};
