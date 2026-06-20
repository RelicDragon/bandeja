import { registerPlugin, Capacitor } from '@capacitor/core';

export interface WatchScoreUpdatedEvent {
  gameId: string;
  matchId: string;
  revision?: number;
}

interface LiveScoringBridgePlugin {
  relayLiveScoringUpdate(options: {
    gameId: string;
    matchId: string;
    liveScoring?: unknown;
  }): Promise<void>;
  relayMatchTimerUpdate(options: {
    gameId: string;
    matchId: string;
    snapshot: import('@/utils/matchTimer').MatchTimerSnapshot;
  }): Promise<void>;
  addListener(
    eventName: 'watchScoreUpdated',
    listenerFunc: (event: WatchScoreUpdatedEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const LiveScoringBridge = registerPlugin<LiveScoringBridgePlugin>('LiveScoringBridge');

let watchListenerHandle: { remove: () => Promise<void> } | null = null;

export async function relayLiveScoringToWatch(payload: {
  gameId: string;
  matchId: string;
  liveScoring: unknown;
}): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await LiveScoringBridge.relayLiveScoringUpdate({
      gameId: payload.gameId,
      matchId: payload.matchId,
      liveScoring: payload.liveScoring ?? null,
    });
  } catch (error) {
    console.warn('LiveScoringBridge: failed to relay live scoring to watch', error);
  }
}

export async function relayMatchTimerToWatch(payload: {
  gameId: string;
  matchId: string;
  snapshot: import('@/utils/matchTimer').MatchTimerSnapshot;
}): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await LiveScoringBridge.relayMatchTimerUpdate({
      gameId: payload.gameId,
      matchId: payload.matchId,
      snapshot: payload.snapshot,
    });
  } catch (error) {
    console.warn('LiveScoringBridge: failed to relay match timer to watch', error);
  }
}

export async function initLiveScoringBridge(
  onWatchScoreUpdated: (event: WatchScoreUpdatedEvent) => void
): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  if (watchListenerHandle) return;
  try {
    watchListenerHandle = await LiveScoringBridge.addListener('watchScoreUpdated', onWatchScoreUpdated);
  } catch (error) {
    console.warn('LiveScoringBridge: failed to subscribe to watch score updates', error);
  }
}

export async function teardownLiveScoringBridge(): Promise<void> {
  if (!watchListenerHandle) return;
  try {
    await watchListenerHandle.remove();
  } catch {
    /* ignore */
  }
  watchListenerHandle = null;
}
