import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LiveBandejaRotatingLogo, LiveScoreShell } from '@/components/liveScoring';
import { useLiveMatchBoardState, liveBoardPlayersForTeam } from '@/hooks/useLiveMatchBoardState';
import { useNetworkStore } from '@/utils/networkStatus';
import { parseLiveBoardTheme, type LiveTeamSide } from '@/utils/liveScoring';
import { isLiveMatchCompleteForScoring } from '@/utils/scoring';

const noop = () => {};
const noopSide = (_side: LiveTeamSide) => {};
const noopServeSetup = () => {};

export const GameBroadcastMatchPage = () => {
  const { id: gameId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const spectatorToken = searchParams.get('spectatorToken');
  const transparent = searchParams.get('transparent') === '1';
  const showPill = searchParams.get('pill') !== '0';
  const boardTheme = parseLiveBoardTheme(searchParams.get('theme'));
  const { t } = useTranslation();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { rawMatch, liveState, revision, loading, error, rules, timerDisplay } = useLiveMatchBoardState(
    gameId,
    matchId,
    { spectatorToken }
  );

  const teamAPlayers = useMemo(() => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 1) : []), [rawMatch]);
  const teamBPlayers = useMemo(() => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 2) : []), [rawMatch]);
  const matchDecided = Boolean(liveState && rules && isLiveMatchCompleteForScoring(liveState.sets, rules));

  useEffect(() => {
    if (!transparent) return;
    const root = document.documentElement;
    root.classList.add('broadcast-transparent-root');
    return () => root.classList.remove('broadcast-transparent-root');
  }, [transparent]);

  const shellClass =
    transparent
      ? boardTheme === 'light'
        ? 'relative min-h-[100dvh] w-full bg-transparent text-gray-900'
        : 'relative min-h-[100dvh] w-full bg-transparent text-white'
      : boardTheme === 'light'
        ? 'relative min-h-[100dvh] w-full bg-white text-gray-900'
        : 'relative min-h-[100dvh] w-full bg-black text-white';

  const pillCls = showPill
    ? boardTheme === 'light'
      ? isOnline
        ? 'rounded-full border border-emerald-600/25 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-900'
        : 'rounded-full border border-amber-600/30 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-950'
      : isOnline
        ? 'rounded-full border border-white/15 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100'
        : 'rounded-full border border-white/15 bg-amber-500/25 px-3 py-1.5 text-xs font-semibold text-amber-50'
    : '';

  if (!matchId) {
    return (
      <div className={shellClass}>
        <div className="p-4 text-sm">Missing matchId</div>
        <Link to={`/games/${gameId}`} className="p-4 text-sm text-primary-300 underline">
          {t('gameDetails.liveTvExit')}
        </Link>
      </div>
    );
  }

  return (
    <div
      className={shellClass}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="relative flex min-h-[100dvh] w-full max-w-none flex-col">
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex w-full max-w-none items-start justify-between gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
          <LiveBandejaRotatingLogo variant="broadcast" alt="Bandeja" />
          <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
            {showPill ? (
              <div className={`pointer-events-auto ${pillCls}`}>
                {isOnline ? t('gameDetails.liveTvPillLive') : t('gameDetails.liveTvPillOffline')}
              </div>
            ) : null}
            {matchDecided ? (
              <div
                className={`pointer-events-auto rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  boardTheme === 'light'
                    ? 'border-emerald-600/30 bg-emerald-500/15 text-emerald-900'
                    : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-100'
                }`}
              >
                {t('gameDetails.liveScoring.matchComplete')}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="min-h-0 flex-1" aria-hidden />
          <div className="flex w-full shrink-0 flex-col items-start px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-4">
            {timerDisplay ? (
              <div
                className={`mb-2 w-fit max-w-full rounded-md border px-2 py-1 text-left font-mono text-[11px] font-semibold tabular-nums sm:text-xs ${
                  boardTheme === 'light'
                    ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
                    : 'border-zinc-600/50 bg-zinc-950/80 text-zinc-200'
                }`}
              >
                {timerDisplay}
              </div>
            ) : null}
            <main className="flex w-full justify-start">
              {loading ? (
                <div className="w-full py-2 text-center text-sm opacity-60">…</div>
              ) : error && !rawMatch ? (
                <div className="flex w-full flex-col items-center gap-2 py-4 text-center text-sm">
                  {error}
                  <Link to={`/games/${gameId}`} className="text-primary-300 underline">
                    {t('gameDetails.liveTvExit')}
                  </Link>
                </div>
              ) : liveState ? (
                <LiveScoreShell
                  state={liveState}
                  teamAPlayers={teamAPlayers}
                  teamBPlayers={teamBPlayers}
                  revision={revision}
                  rules={rules}
                  gameId={gameId}
                  boardTheme={boardTheme}
                  broadcast
                  scoringLocked
                  onScore={noopSide}
                  onUndo={noopSide}
                  onServeSetupComplete={noopServeSetup}
                  onSkipServeGuide={noop}
                />
              ) : (
                <div className="w-full py-2 text-center text-sm opacity-60">No live state</div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};
