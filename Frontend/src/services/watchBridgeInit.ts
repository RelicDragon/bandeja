import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import {
  initLiveScoringBridge,
  relayLiveScoringToWatch,
  relayMatchTimerToWatch,
  teardownLiveScoringBridge,
  type WatchScoreUpdatedEvent,
} from '@/services/liveScoringBridge';

let socketRelayCleanups: Array<() => void> = [];
let bridgeInitialized = false;

function handleWatchScoreUpdated(event: WatchScoreUpdatedEvent): void {
  if (!event.gameId || !event.matchId) return;
  useSocketEventsStore.setState({
    lastWatchLiveScoringHint: {
      gameId: event.gameId,
      matchId: event.matchId,
      revision:
        typeof event.revision === 'number' && Number.isFinite(event.revision)
          ? Math.floor(event.revision)
          : 0,
      receivedAt: Date.now(),
    },
  });
}

export async function initWatchBridge(): Promise<void> {
  if (bridgeInitialized) return;
  bridgeInitialized = true;

  void initLiveScoringBridge(handleWatchScoreUpdated);

  const handleMatchTimerUpdated = (data: {
    gameId: string;
    matchId: string;
    snapshot: import('@/utils/matchTimer').MatchTimerSnapshot;
  }) => {
    void relayMatchTimerToWatch(data);
  };

  const handleMatchLiveScoringUpdated = (data: {
    gameId: string;
    matchId: string;
    liveScoring: unknown;
  }) => {
    void relayLiveScoringToWatch(data);
  };

  socketService.on('match-timer-updated', handleMatchTimerUpdated);
  socketService.on('match-live-scoring-updated', handleMatchLiveScoringUpdated);

  socketRelayCleanups = [
    () => socketService.off('match-timer-updated', handleMatchTimerUpdated),
    () => socketService.off('match-live-scoring-updated', handleMatchLiveScoringUpdated),
  ];
}

export async function teardownWatchBridge(): Promise<void> {
  socketRelayCleanups.forEach((cleanup) => cleanup());
  socketRelayCleanups = [];
  bridgeInitialized = false;
  void teardownLiveScoringBridge();
  useSocketEventsStore.setState({ lastWatchLiveScoringHint: null });
}
