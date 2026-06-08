import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  LiveMatchPageChrome,
  LiveMatchRevisionFooter,
  LiveMatchTimedSetControls,
  LiveOptionalDeciderSheet,
  LiveScoreShell,
} from '@/components/liveScoring';
import { useLiveMatchController } from '@/hooks/useLiveMatchController';
import { useLiveMatchTvChrome } from '@/hooks/liveMatchController/useLiveMatchTvChrome';
import { useNetworkStore } from '@/utils/networkStatus';
import { useWakeScreenForLiveScoring } from '@/hooks/useWakeScreenForLiveScoring';
import { parseGameSport } from '@/utils/gameSport';
import { SportLevelProvider } from '@/contexts/SportLevelContext';

export const GameLiveMatchPage = () => {
  const { id: gameId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { pathname, search: locationSearch } = useLocation();
  const matchId = searchParams.get('matchId') || '';
  const tv = searchParams.get('tv') === '1';
  const themeParam = searchParams.get('theme');
  const spectatorToken = searchParams.get('spectatorToken');
  const navigate = useNavigate();
  const isOnline = useNetworkStore((s) => s.isOnline);

  const controller = useLiveMatchController(gameId, matchId, {
    tv,
    themeParam,
    spectatorToken,
    pathname,
    locationSearch,
  });
  const { showTvChrome, bumpTvChrome } = useLiveMatchTvChrome(tv);
  useWakeScreenForLiveScoring(Boolean(gameId && matchId));

  const {
    game,
    match,
    gameTitle,
    liveState,
    rules,
    revision,
    loading,
    error,
    boardTheme,
    playersByTeam,
    playersPerMatch,
    timerDisplay,
    saving,
    scorePoint,
    unscorePoint,
    applyOptionalDecider,
    kitchenFault,
    letPending,
    letReplay,
    serviceFault,
    serveSetupComplete,
    skipServeGuide,
    timedFreeze,
    timedUnlock,
    scoringLocked,
    liveMatchStatusNote,
    showOptionalDeciderSheet,
    canTimedSetFreeze,
    canTimedSetUnlock,
    spectatorTvUrl,
    broadcastShareUrl,
    controlUrl,
  } = controller;

  const shellClass = tv
    ? boardTheme === 'light'
      ? 'relative flex min-h-[100dvh] flex-col bg-white text-gray-900'
      : 'relative flex min-h-[100dvh] flex-col bg-black text-white'
    : 'flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100';

  if (!matchId) {
    return (
      <div className={shellClass}>
        <div className="p-4">Missing matchId</div>
        <Link to={`/games/${gameId}`} className="p-4 text-primary-600">
          Back
        </Link>
      </div>
    );
  }

  return (
    <SportLevelProvider sport={game ? parseGameSport(game.sport) : undefined}>
      <div
        className={shellClass}
        onPointerDown={tv ? bumpTvChrome : undefined}
        style={{
          paddingTop: tv && !showTvChrome ? 0 : 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <LiveMatchPageChrome
          tv={tv}
          showTvChrome={showTvChrome}
          gameId={gameId}
          gameTitle={gameTitle}
          isOnline={isOnline}
          boardTheme={boardTheme}
          controlUrl={controlUrl}
          broadcastShareUrl={broadcastShareUrl}
          spectatorTvUrl={spectatorTvUrl}
          timerDisplay={timerDisplay}
          onBack={() => navigate(-1)}
        />

        <main
          className={`flex min-h-0 flex-1 flex-col overflow-hidden px-3 ${
            tv && !showTvChrome && gameTitle.trim() ? 'pb-4 pt-10 sm:pt-11' : 'pb-2 pt-2'
          }`}
        >
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm opacity-70">…</div>
          ) : error && !match ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
              {error}
              <Link to={`/games/${gameId}`} className="text-primary-400 underline">
                Game
              </Link>
            </div>
          ) : liveState && rules ? (
            <>
              {!tv ? (
                <LiveMatchTimedSetControls
                  canFreeze={canTimedSetFreeze}
                  canUnlock={canTimedSetUnlock}
                  onFreeze={timedFreeze}
                  onUnlock={timedUnlock}
                />
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col">
                <LiveScoreShell
                  state={liveState}
                  teamAPlayers={playersByTeam.teamA}
                  teamBPlayers={playersByTeam.teamB}
                  revision={revision}
                  rules={rules}
                  sport={game?.sport}
                  scoringPreset={game?.scoringPreset ?? null}
                  playersPerMatch={playersPerMatch}
                  gameMetadata={game?.metadata}
                  officiatingLetPending={liveState.officiatingLetPending}
                  onKitchenFault={kitchenFault}
                  onLet={letPending}
                  onLetReplay={letReplay}
                  onServiceFault={serviceFault}
                  gameId={gameId}
                  boardTheme={boardTheme}
                  tv={tv}
                  saving={saving}
                  error={error}
                  statusNote={liveMatchStatusNote}
                  scoringLocked={scoringLocked}
                  isOnline={isOnline}
                  onScore={scorePoint}
                  onUndo={unscorePoint}
                  onServeSetupComplete={serveSetupComplete}
                  onSkipServeGuide={skipServeGuide}
                  {...(!tv ? { shareTvUrl: spectatorTvUrl, shareBroadcastUrl: broadcastShareUrl } : {})}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm opacity-70">No live state</div>
          )}
        </main>

        <LiveOptionalDeciderSheet open={showOptionalDeciderSheet} onChoose={applyOptionalDecider} />
        {liveState ? (
          <LiveMatchRevisionFooter revision={revision} saving={saving} boardTheme={boardTheme} tv={tv} />
        ) : null}
      </div>
    </SportLevelProvider>
  );
};
