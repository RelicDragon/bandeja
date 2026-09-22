// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/types/gameResults';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/i18n/config', () => ({ default: { t: (key: string) => key } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('@/api', () => ({ gamesApi: { getById: vi.fn(async () => ({})) } }));
vi.mock('@/api/results', () => ({ resultsApi: {
  updateMatch: vi.fn(), getGameResults: vi.fn(async () => ({})),
} }));
vi.mock('@/api/matchTimer', () => ({ matchTimerApi: { transition: vi.fn() } }));
vi.mock('./resultsStorage', () => ({ ResultsStorage: { saveResults: vi.fn(), setServerProblem: vi.fn() } }));

import toast from 'react-hot-toast';
import { resultsApi } from '@/api/results';
import { ResultsStorage } from './resultsStorage';
import { GameResultsEngine, useGameResultsStore } from './gameResultsEngine';
import { useScoreEntryState } from '@/components/gameResults/scoreEntry/useScoreEntryState';
import { useSetEntryOperations } from '@/components/GameDetails/resultsEntry/useSetEntryOperations';

// Both regular results and league cards use this dialog -> set operations -> engine path.
describe('manual score draft concurrency', () => {
  let root: Root;
  let entry: ReturnType<typeof useScoreEntryState>;
  let saving: Promise<unknown> | undefined;

  function setMatch(match: Match, resultsVersion = 'board-v0') {
    useGameResultsStore.setState({ resultsVersion, rounds: [{ id: 'round', matches: [match] }] });
  }

  function snapshot(version: string | undefined = 'v0', score = 1): Match {
    return { id: 'match', resultsVersion: version, teamA: [], teamB: [], sets: [{ teamA: score, teamB: 0 }] };
  }

  function Probe({ setIndex = 0 }: { setIndex?: number }) {
    const rounds = useGameResultsStore(state => state.rounds);
    const ops = useSetEntryOperations({
      rounds,
      updateMatch: (roundId, matchId, data) => GameResultsEngine.updateMatch(roundId, matchId, data),
      onSupplementalSetAdded: () => {},
    });
    entry = useScoreEntryState({
      match: rounds[0].matches[0], setIndex, players: [], onClose: () => {},
      onSave: (...args) => { saving = ops.updateSetResult('round', ...args); },
      onRemove: (...args) => { saving = ops.removeSet('round', ...args); },
    });
    return null;
  }

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    await GameResultsEngine.cleanup();
    useGameResultsStore.setState({ gameId: 'game', userId: 'owner', initialized: true, canEdit: true });
    setMatch(snapshot());
    vi.mocked(resultsApi.updateMatch).mockResolvedValue({ success: true, data: { liveScoringCleared: false, resultsVersion: 'saved' } });
    saving = undefined;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    act(() => root.unmount());
    await GameResultsEngine.cleanup();
  });

  it.each([false, true])('rejects a refreshed draft before changing local scores (offline=%s)', async (offline) => {
    await act(async () => root.render(<Probe />));
    act(() => entry.setTeamScore('teamA', 2));
    act(() => {
      setMatch(snapshot('v1', 9), 'board-v1');
      useGameResultsStore.setState({ serverProblem: offline });
    });
    expect(entry.teamAScore).toBe(2);
    await act(async () => { entry.handleSave(); await saving; });
    expect(resultsApi.updateMatch).not.toHaveBeenCalled();
    expect(ResultsStorage.saveResults).not.toHaveBeenCalled();
    expect(GameResultsEngine.getState().rounds[0].matches[0].sets[0].teamA).toBe(9);
    expect(GameResultsEngine.getState().resultsVersion).toBe('board-v1');
    expect(GameResultsEngine.getState().serverProblem).toBe(offline);
    expect(toast.error).toHaveBeenCalledWith('gameDetails.liveScoring.syncConflictRetry');
  });

  it('submits the original version when a remote change has not yet reached the screen', async () => {
    await act(async () => root.render(<Probe />));
    act(() => entry.setTeamScore('teamA', 2));
    vi.mocked(resultsApi.updateMatch).mockRejectedValueOnce({ response: { status: 409, data: { message: 'Scores changed' } } });
    await act(async () => { entry.handleSave(); await saving; });
    expect(resultsApi.updateMatch).toHaveBeenCalledWith('game', 'match', expect.objectContaining({
      baseVersion: 'v0', sets: [expect.objectContaining({ teamA: 2 })],
    }));
    expect(GameResultsEngine.getState().rounds[0].matches[0].sets[0].teamA).toBe(1);
    expect(GameResultsEngine.getState().serverProblem).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Scores changed');
  });

  it('allows a fresh correction after closing and reopening on the latest version', async () => {
    await act(async () => root.render(<Probe />));
    act(() => setMatch(snapshot('v1', 9), 'board-v1'));
    act(() => root.render(null));
    await act(async () => root.render(<Probe />));
    expect(entry.teamAScore).toBe(9);
    act(() => entry.setTeamScore('teamA', 10));
    await act(async () => { entry.handleSave(); await saving; });
    expect(resultsApi.updateMatch).toHaveBeenCalledWith('game', 'match', expect.objectContaining({ baseVersion: 'v1' }));
  });

  it('allows a draft when only another court changed', async () => {
    await act(async () => root.render(<Probe />));
    act(() => entry.setTeamScore('teamA', 2));
    act(() => setMatch(snapshot('v0'), 'board-v1'));
    await act(async () => { entry.handleSave(); await saving; });
    expect(resultsApi.updateMatch).toHaveBeenCalledWith('game', 'match', expect.objectContaining({ baseVersion: 'v0' }));
  });

  it('does not adopt a version first received after a versionless draft opened', async () => {
    setMatch({ ...snapshot(), resultsVersion: undefined });
    await act(async () => root.render(<Probe />));
    act(() => setMatch(snapshot('v1', 9), 'board-v1'));
    await act(async () => { entry.handleSave(); await saving; });
    expect(resultsApi.updateMatch).not.toHaveBeenCalled();
    expect(ResultsStorage.saveResults).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('gameDetails.liveScoring.syncConflictRetry');
  });

  it.each(['save', 'remove'] as const)('protects supplemental set %s after a remote refresh', async (action) => {
    const match: Match = { ...snapshot(), sets: [{ teamA: 1, teamB: 0 }, { teamA: 3, teamB: 0, role: 'EXTRA_GAMES' }] };
    setMatch(match);
    await act(async () => root.render(<Probe setIndex={1} />));
    act(() => entry.setTeamScore('teamA', 4));
    const refreshed: Match = { ...match, resultsVersion: 'v1', sets: [match.sets[0], { teamA: 8, teamB: 0, role: 'EXTRA_GAMES' }] };
    act(() => setMatch(refreshed, 'board-v1'));
    await act(async () => {
      if (action === 'save') entry.handleSave();
      else entry.handleRemove();
      await saving;
    });
    expect(resultsApi.updateMatch).not.toHaveBeenCalled();
    expect(GameResultsEngine.getState().rounds[0].matches[0]).toEqual(refreshed);
    expect(toast.error).toHaveBeenCalledWith('gameDetails.liveScoring.syncConflictRetry');
  });

  it.each(['save', 'remove'] as const)('allows supplemental set %s with the original version', async (action) => {
    setMatch({ ...snapshot(), sets: [{ teamA: 1, teamB: 0 }, { teamA: 3, teamB: 0, role: 'EXTRA_GAMES' }] });
    await act(async () => root.render(<Probe setIndex={1} />));
    await act(async () => {
      if (action === 'save') entry.handleSave();
      else entry.handleRemove();
      await saving;
    });
    expect(resultsApi.updateMatch).toHaveBeenCalledWith('game', 'match', expect.objectContaining({ baseVersion: 'v0' }));
  });
});
