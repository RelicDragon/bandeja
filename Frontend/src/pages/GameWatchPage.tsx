import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { RadioTower, WifiOff } from 'lucide-react';
import { LiveScoreShell } from '@/components/liveScoring';
import { LiveBandejaRotatingLogo } from '@/components/liveScoring/LiveBandejaRotatingLogo';
import { SpectatorTopBar } from '@/components/live/SpectatorTopBar';
import { WatchAmbient } from '@/components/live/watch/WatchAmbient';
import { WatchStage } from '@/components/live/watch/WatchStage';
import { WatchStageSkeleton } from '@/components/live/watch/WatchStageSkeleton';
import { useWatchBoardPlugin } from '@/components/live/watch/useWatchBoardPlugin';
import { watchBezel } from '@/components/live/watch/watchTheme';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { useLiveMatchBoardState, liveBoardPlayersForTeam } from '@/hooks/useLiveMatchBoardState';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useWakeScreenForLiveScoring } from '@/hooks/useWakeScreenForLiveScoring';
import { useResolvedAppAppearance } from '@/store/themeStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { isAutomaticLiveMatchComplete, type LiveBoardTheme, type LiveTeamSide } from '@/utils/liveScoring';
import { isLiveMatchCompleteForScoring } from '@/utils/scoring';
import { playersPerMatchOf } from '@/utils/matchFormat';
import { parseGameSport } from '@/utils/gameSport';

const noop = () => {};
const noopSide = (_side: LiveTeamSide) => {};
const EASE = [0.32, 0.72, 0, 1] as const;

function WatchUnavailable({ light, message }: { light: boolean; message: string }) {
  const bezel = watchBezel(light);
  return (
    <div className={bezel.shell}>
      <div
        className={`flex flex-col items-center gap-4 px-8 py-14 text-center ${bezel.core} ${
          light ? 'bg-white' : 'bg-[#111113] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
        }`}
      >
        <span
          className={`flex size-14 items-center justify-center rounded-full ${
            light ? 'bg-zinc-100 text-zinc-500' : 'bg-white/[0.06] text-zinc-400'
          }`}
        >
          <RadioTower size={24} strokeWidth={1.25} aria-hidden />
        </span>
        <p className={`max-w-[16rem] text-[15px] leading-relaxed ${light ? 'text-zinc-600' : 'text-zinc-300'}`}>{message}</p>
      </div>
    </div>
  );
}

/**
 * What a viewer sees after tapping **Watch live**: the spectator stage
 * (`WatchStage`) for padel / tennis, the shared TV board for rally sports —
 * read only, under the spectator strip. `/games/:id/broadcast` stays the OBS
 * overlay and `/games/:id/live?tv=1` stays the scorer's TV mirror (its toolbar
 * hands out the scoring link), so neither is shown to a spectator.
 */
export const GameWatchPage = () => {
  const { id: gameId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const spectatorToken = searchParams.get('spectatorToken');
  const { t } = useTranslation();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const reduceMotion = usePrefersReducedMotion();
  const boardTheme: LiveBoardTheme = useResolvedAppAppearance() === 'light' ? 'light' : 'dark';
  const { game, rawMatch, liveState, revision, loading, error, rules, timerDisplay } = useLiveMatchBoardState(
    gameId,
    matchId,
    { spectatorToken },
  );
  useWakeScreenForLiveScoring(Boolean(gameId && matchId));

  const playersPerMatch = useMemo(() => playersPerMatchOf(game ?? {}), [game]);
  const teamAPlayers = useMemo(() => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 1, game) : []), [rawMatch, game]);
  const teamBPlayers = useMemo(() => (rawMatch ? liveBoardPlayersForTeam(rawMatch, 2, game) : []), [rawMatch, game]);
  const matchDecided = Boolean(
    liveState &&
      (rules.strictValidation === 'CLASSIC_AUTOMATIC_RELAXED'
        ? isAutomaticLiveMatchComplete(liveState, rules)
        : isLiveMatchCompleteForScoring(liveState.sets, rules)),
  );
  const { isRally, serveIndicator } = useWatchBoardPlugin({
    state: liveState,
    rules,
    sport: game?.sport,
    scoringPreset: game?.scoringPreset ?? null,
    gameMetadata: game?.metadata,
    teamAPlayers,
    teamBPlayers,
    playersPerMatch,
  });

  const light = boardTheme === 'light';
  const unavailable = !matchId || Boolean(error && !rawMatch);
  const rallyBoard = !unavailable && Boolean(liveState) && isRally;
  const pill = `pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-brand text-[11px] font-semibold uppercase tracking-[0.16em] backdrop-blur-xl`;
  const pillMotion = {
    initial: reduceMotion ? false : { opacity: 0, y: -8, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.94 },
    transition: { duration: 0.45, ease: EASE },
  } as const;

  return (
    <SportLevelProvider sport={game ? parseGameSport(game.sport) : undefined}>
      <div
        data-testid="game-watch-page"
        className={`relative isolate flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden ${
          light ? 'bg-[#f4f4f2] text-zinc-900' : 'bg-[#060607] text-white'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <WatchAmbient light={light} />

        <div className="relative z-20 mx-auto w-full max-w-[26rem] shrink-0 px-4 pt-3 md:max-w-[32rem]">
          <SpectatorTopBar
            gameId={gameId}
            clubName={game?.club?.name ?? game?.court?.club?.name ?? null}
            courtName={game?.court?.name ?? null}
            players={[...teamAPlayers, ...teamBPlayers]}
            boardTheme={boardTheme}
          />
          {/* Floats under the strip so it never pushes the board around. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-full mt-2 flex justify-center gap-2"
            aria-live="polite"
          >
            <AnimatePresence initial={false}>
              {!isOnline ? (
                <motion.span
                  key="offline"
                  {...pillMotion}
                  className={`${pill} ${light ? 'bg-amber-100/90 text-amber-900' : 'bg-amber-400/15 text-amber-200'}`}
                >
                  <WifiOff size={13} strokeWidth={1.75} aria-hidden />
                  {t('gameDetails.liveTvPillOffline')}
                </motion.span>
              ) : null}
              {rallyBoard && matchDecided ? (
                <motion.span
                  key="complete"
                  {...pillMotion}
                  className={`${pill} ${light ? 'bg-emerald-100/90 text-emerald-800' : 'bg-emerald-400/15 text-emerald-200'}`}
                >
                  {t('gameDetails.liveScoring.matchComplete')}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {rallyBoard && liveState ? (
            <motion.div
              className="flex min-h-0 flex-1 flex-col"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <LiveScoreShell
                state={liveState}
                teamAPlayers={teamAPlayers}
                teamBPlayers={teamBPlayers}
                revision={revision}
                rules={rules}
                sport={game?.sport}
                scoringPreset={game?.scoringPreset ?? null}
                playersPerMatch={playersPerMatch}
                gameMetadata={game?.metadata}
                gameId={gameId}
                boardTheme={boardTheme}
                tv
                broadcastTimer={timerDisplay}
                scoringLocked
                isOnline={isOnline}
                onScore={noopSide}
                onUndo={noopSide}
                onServeSetupComplete={noop}
                onSkipServeGuide={noop}
              />
            </motion.div>
          ) : (
            <>
              <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center px-4 pb-4 pt-6 md:max-w-[32rem] [@media(max-height:560px)]:py-3">
                {unavailable ? (
                  <WatchUnavailable light={light} message={t('live.openFailed')} />
                ) : !liveState ? (
                  <div aria-busy={loading}>
                    <WatchStageSkeleton light={light} />
                  </div>
                ) : (
                  <WatchStage
                    state={liveState}
                    rules={rules}
                    teamAPlayers={teamAPlayers}
                    teamBPlayers={teamBPlayers}
                    boardTheme={boardTheme}
                    serveIndicator={serveIndicator}
                    matchDecided={matchDecided}
                    timer={timerDisplay}
                  />
                )}
              </div>
              <div className={`flex shrink-0 justify-center pb-5 opacity-25 ${light ? 'invert' : ''}`}>
                <LiveBandejaRotatingLogo variant="tv" alt="" />
              </div>
            </>
          )}
        </main>
      </div>
    </SportLevelProvider>
  );
};
