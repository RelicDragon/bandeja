import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/config', () => ({ default: { t: (key: string) => key } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('@/api', () => ({ gamesApi: { getById: vi.fn(async () => ({})) } }));
vi.mock('@/api/results', () => ({ resultsApi: {
  updateMatch: vi.fn(), getGameResults: vi.fn(async () => ({})), syncResults: vi.fn(),
  generateRound: vi.fn(),
} }));
vi.mock('@/api/matchTimer', () => ({ matchTimerApi: { transition: vi.fn() } }));
vi.mock('./resultsStorage', () => ({
  ResultsStorage: { saveResults: vi.fn(), setServerProblem: vi.fn() },
}));

import { resultsApi } from '@/api/results';
import toast from 'react-hot-toast';
import { ResultsStorage } from './resultsStorage';
import type { Game } from '@/types';
import { matchTimerApi } from '@/api/matchTimer';
import { GameResultsEngine, useGameResultsStore } from './gameResultsEngine';

describe('results connectivity after a rejected edit', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await GameResultsEngine.cleanup();
    useGameResultsStore.setState({
      gameId: 'game', userId: 'owner', initialized: true, canEdit: true,
      rounds: [{ id: 'round', matches: [{
        id: 'match', teamA: ['a'], teamB: ['b'], sets: [{ teamA: 10, teamB: 11 }],
      }] }],
    });
  });

  it.each([400, 401, 403, 404, 409, 422])('keeps online editing available after a %s rejection', async (status) => {
    const rejected = { response: { status, data: { message: 'Invalid score' } } };
    vi.mocked(resultsApi.updateMatch).mockRejectedValueOnce(rejected);
    const original = GameResultsEngine.getState().rounds;
    await GameResultsEngine.updateMatch('round', 'match', {
      teamA: ['a'], teamB: ['b'], sets: [{ teamA: 22, teamB: 0 }],
    }).catch(() => undefined);

    expect(GameResultsEngine.getState().serverProblem).toBe(false);
    expect(GameResultsEngine.getState().rounds).toEqual(original);
    expect(toast.error).toHaveBeenCalledWith('Invalid score');
    vi.mocked(resultsApi.updateMatch).mockResolvedValueOnce({ success: true, data: {} });
    await GameResultsEngine.setMatchCourt('round', 'match', 'court');
    expect(resultsApi.updateMatch).toHaveBeenCalledTimes(2);
  });

  it('preserves a score locally when the request cannot reach the server', async () => {
    vi.mocked(resultsApi.updateMatch).mockRejectedValueOnce(new TypeError('Network request failed'));
    await GameResultsEngine.updateMatch('round', 'match', {
      teamA: ['a'], teamB: ['b'], sets: [{ teamA: 12, teamB: 9 }],
    });
    expect(GameResultsEngine.getState().serverProblem).toBe(true);
    expect(GameResultsEngine.getState().rounds[0].matches[0].sets).toEqual([{ teamA: 12, teamB: 9 }]);
    await GameResultsEngine.reloadFromRemote();
    expect(resultsApi.getGameResults).not.toHaveBeenCalled();
    expect(GameResultsEngine.getState().rounds[0].matches[0].sets).toEqual([{ teamA: 12, teamB: 9 }]);
  });

  it.each([408, 429, 500, 503])('keeps local scores recoverable after a temporary %s failure', async (status) => {
    vi.mocked(resultsApi.updateMatch).mockRejectedValueOnce({ response: { status } });
    await GameResultsEngine.setMatchCourt('round', 'match', 'court');
    expect(GameResultsEngine.getState().serverProblem).toBe(true);
    expect(GameResultsEngine.getState().rounds[0].matches[0].courtId).toBe('court');
  });

  it('does not label a rejected round generation as offline', async () => {
    useGameResultsStore.setState({ game: { id: 'game' } as Game });
    const error = { response: { status: 400, data: { message: 'Cannot generate round' } } };
    vi.mocked(resultsApi.generateRound).mockRejectedValueOnce(error);
    await expect(GameResultsEngine.addRound()).rejects.toBe(error);
    expect(GameResultsEngine.getState().serverProblem).toBe(false);
  });

  it('rolls back a rejected timer transition without reporting an outage', async () => {
    useGameResultsStore.setState({ game: { id: 'game', matchTimedCapMinutes: 15, matchTimerEnabled: true } as Game });
    const original = GameResultsEngine.getState().rounds;
    vi.mocked(matchTimerApi.transition).mockRejectedValueOnce({ response: { status: 403, data: { message: 'Forbidden' } } });
    await GameResultsEngine.transitionMatchTimer('round', 'match', 'start');
    expect(matchTimerApi.transition).toHaveBeenCalledOnce();
    expect(GameResultsEngine.getState().serverProblem).toBe(false);
    expect(GameResultsEngine.getState().rounds).toEqual(original);
    expect(toast.error).toHaveBeenCalledWith('Forbidden');
  });

  it('clears the warning after an explicit successful sync', async () => {
    useGameResultsStore.setState({ serverProblem: true });
    vi.mocked(resultsApi.getGameResults).mockResolvedValueOnce({ success: true, data: { rounds: [{}] } });
    await GameResultsEngine.syncToServer();
    expect(resultsApi.syncResults).toHaveBeenCalledWith('game', GameResultsEngine.getState().rounds);
    expect(GameResultsEngine.getState().serverProblem).toBe(false);
    expect(GameResultsEngine.getState().syncStatus).toBe('SUCCESS');
  });

  it('releases the mutation guard if local storage fails without reporting a network outage', async () => {
    vi.mocked(ResultsStorage.saveResults).mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(GameResultsEngine.setMatchCourt('round', 'match', 'court')).rejects.toThrow('Storage unavailable');
    expect(GameResultsEngine.getState().serverProblem).toBe(false);
    await GameResultsEngine.reloadFromRemote();
    expect(resultsApi.getGameResults).toHaveBeenCalledOnce();
  });

  it('does not let a later successful request clear another unsynced edit', async () => {
    let resolveRequest!: () => void;
    const successfulRequest = new Promise<{ success: boolean; data: object }>((resolve) => {
      resolveRequest = () => resolve({ success: true, data: {} });
    });
    let rejectRequest!: (error: Error) => void;
    vi.mocked(resultsApi.updateMatch)
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRequest = reject; }))
      .mockReturnValueOnce(successfulRequest);
    const first = GameResultsEngine.setMatchCourt('round', 'match', 'court-a');
    await vi.waitFor(() => expect(resultsApi.updateMatch).toHaveBeenCalledTimes(1));
    const second = GameResultsEngine.setMatchCourt('round', 'match', 'court-b');
    await vi.waitFor(() => expect(resultsApi.updateMatch).toHaveBeenCalledTimes(2));
    rejectRequest(new Error('Network request failed'));
    await first;
    resolveRequest();
    await second;
    expect(GameResultsEngine.getState().serverProblem).toBe(true);
  });
});
