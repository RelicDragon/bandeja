// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveMatchBoardState } from './useLiveMatchBoardState';
import { resultsApi } from '@/api/results';

vi.mock('@/api/results', () => ({ resultsApi: { getGameResults: vi.fn() } }));
vi.mock('@/api/games', () => ({ gamesApi: { getById: vi.fn(async () => ({ data: { id: 'game', scoringPreset: 'POINTS_21', maxTotalPointsPerSet: 21, ballsInGames: false } })) } }));
vi.mock('@/services/socketService', () => ({ socketService: { onConnect: vi.fn(() => () => {}) } }));
vi.mock('@/services/gameRoomMembership', () => ({ retainGameRoom: vi.fn(async () => {}), releaseGameRoom: vi.fn() }));
vi.mock('@/store/socketEventsStore', async () => {
  const { create } = await import('zustand');
  return { useSocketEventsStore: create(() => ({ lastMatchLiveScoringUpdated: null, lastWatchLiveScoringHint: null, lastMatchTimerUpdated: null })) };
});
import { useSocketEventsStore } from '@/store/socketEventsStore';

function response(revision: number, score: number) {
  return { success: true, data: { rounds: [{ roundNumber: 1, matches: [{ id: 'match',
    sets: [{ teamAScore: score, teamBScore: 3 }],
    metadata: { liveScoring: { v: 1, revision, updatedAt: new Date().toISOString(), state: null } },
  }] }] } };
}

describe('live board concurrent snapshots', () => {
  let root: Root;
  let board: ReturnType<typeof useLiveMatchBoardState>;
  function Probe() { board = useLiveMatchBoardState('game', 'match'); return null; }

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    useSocketEventsStore.setState({ lastMatchLiveScoringUpdated: null });
    vi.mocked(resultsApi.getGameResults).mockResolvedValue(response(1, 5));
    root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Probe />));
  });
  afterEach(() => act(() => root.unmount()));

  it('seeds a corrected manual score from the database set field names', () => {
    expect(board.revision).toBe(1);
    expect(board.liveState?.sets[0].teamA).toBe(5);
    expect(board.liveState?.sets[0].teamB).toBe(3);
  });

  it('does not roll back a newer accepted score when an older HTTP refresh completes', async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    vi.mocked(resultsApi.getGameResults).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    let refresh!: Promise<void>;
    act(() => { refresh = board.refreshMatchLiveFromServer(); });
    act(() => { board.acceptServerState({ ...board.liveState!, sets: [{ teamA: 9, teamB: 3 }] }, 3); });
    await act(async () => { finish(response(2, 6)); await refresh; });
    expect(board.revision).toBe(3);
    expect(board.liveState?.sets[0].teamA).toBe(9);
  });

  it('fetches an authoritative manual correction on a live-clear event', async () => {
    vi.mocked(resultsApi.getGameResults).mockResolvedValueOnce(response(4, 12));
    await act(async () => {
      useSocketEventsStore.setState({ lastMatchLiveScoringUpdated: { gameId: 'game', matchId: 'match', liveScoring: null } });
    });
    expect(board.revision).toBe(4);
    expect(board.liveState?.sets[0].teamA).toBe(12);
    expect(resultsApi.getGameResults).toHaveBeenCalledTimes(2);
    act(() => { board.acceptServerState({ ...board.liveState!, sets: [{ teamA: 8, teamB: 3 }] }, 2); });
    expect(board.revision).toBe(4);
    expect(board.liveState?.sets[0].teamA).toBe(12);
  });

  it('keeps an optimistic point visible during an equal-revision background refresh', async () => {
    act(() => {
      board.setLiveWritePending(true);
      board.setLiveState({ ...board.liveState!, sets: [{ teamA: 6, teamB: 3 }] });
    });
    await act(async () => { await board.refreshMatchLiveFromServer(); });
    expect(board.liveState?.sets[0].teamA).toBe(6);
    act(() => board.setLiveWritePending(false));
    await act(async () => { await board.refreshMatchLiveFromServer(); });
    expect(board.liveState?.sets[0].teamA).toBe(5);
  });
});
