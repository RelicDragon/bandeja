import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { LiveScoreShell } from '@/components/liveScoring';
import { SpectatorTopBar } from '@/components/live/SpectatorTopBar';
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

/**
 * What a viewer sees after tapping **Watch live**: the TV scoreboard, read
 * only, under the spectator strip. `/games/:id/broadcast` stays the OBS
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

  const light = boardTheme === 'light';
  const pillBase = 'rounded-full border px-3 py-1 text-xs font-semibold';
  const offlinePill = light
    ? `${pillBase} border-amber-600/30 bg-amber-500/20 text-amber-950`
    : `${pillBase} border-white/15 bg-amber-500/25 text-amber-50`;
  const completePill = light
    ? `${pillBase} border-emerald-600/30 bg-emerald-500/15 text-emerald-900`
    : `${pillBase} border-emerald-500/30 bg-emerald-500/20 text-emerald-100`;

  return (
    <SportLevelProvider sport={game ? parseGameSport(game.sport) : undefined}>
      <div
        data-testid="game-watch-page"
        className={`flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden ${
          light ? 'bg-white text-gray-900' : 'bg-black text-white'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="shrink-0 px-3 pt-3 sm:px-4">
          <SpectatorTopBar
            gameId={gameId}
            clubName={game?.club?.name ?? game?.court?.club?.name ?? null}
            courtName={game?.court?.name ?? null}
            players={[...teamAPlayers, ...teamBPlayers]}
            boardTheme={boardTheme}
          />
        </div>

        {!isOnline || matchDecided ? (
          <div className="flex shrink-0 justify-center gap-2 px-3 pt-2" aria-live="polite">
            {!isOnline ? <span className={offlinePill}>{t('gameDetails.liveTvPillOffline')}</span> : null}
            {matchDecided ? (
              <span className={completePill}>{t('gameDetails.liveScoring.matchComplete')}</span>
            ) : null}
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1 flex-col">
          {!matchId || (error && !rawMatch) ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm opacity-80">
              {t('live.openFailed')}
            </div>
          ) : !liveState ? (
            <div className="flex flex-1 items-center justify-center text-sm opacity-60" aria-busy={loading}>
              …
            </div>
          ) : (
            <motion.div
              className="flex min-h-0 flex-1 flex-col"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
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
          )}
        </main>
      </div>
    </SportLevelProvider>
  );
};
