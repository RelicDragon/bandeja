import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { createInitialLiveScoringState } from '@/utils/liveScoring';
import { buildScorePointMutation } from '@/hooks/liveMatchController/scorePointAction';
import { persistLiveScoringPatch } from '@/hooks/liveMatchController/persistLiveScoring';

const patchMatchLiveScoring = vi.hoisted(() => vi.fn());

vi.mock('@/api/results', () => ({
  resultsApi: {
    patchMatchLiveScoring: (...args: unknown[]) => patchMatchLiveScoring(...args),
  },
}));

const pointsRules = {
  ...getRulesFromPreset('POINTS_16'),
  preset: 'POINTS_16' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: true,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

describe('buildScorePointMutation', () => {
  it('scores a point and clears let pending', () => {
    let state = createInitialLiveScoringState(pointsRules);
    state = { ...state, officiatingLetPending: true };
    const result = buildScorePointMutation(state, 'teamA', pointsRules);
    expect(result.changed).toBe(true);
    expect(result.state.sets[0]?.teamA).toBe(1);
    expect(result.state.officiatingLetPending).toBeFalsy();
  });
});

describe('persistLiveScoringPatch', () => {
  beforeEach(() => {
    patchMatchLiveScoring.mockReset();
  });

  it('calls patch API and returns parsed server state', async () => {
    const initial = createInitialLiveScoringState(pointsRules);
    const scored = buildScorePointMutation(initial, 'teamA', pointsRules).state;
    patchMatchLiveScoring.mockResolvedValue({
      data: {
        liveScoring: {
          version: 1,
          revision: 2,
          state: scored,
        },
      },
    });

    const result = await persistLiveScoringPatch({
      gameId: 'g1',
      matchId: 'm1',
      nextState: scored,
      baseRevision: 1,
      opId: 'op-1',
      rules: pointsRules,
      rawMatchSets: undefined,
    });

    expect(patchMatchLiveScoring).toHaveBeenCalledOnce();
    expect(patchMatchLiveScoring.mock.calls[0]?.[0]).toBe('g1');
    expect(patchMatchLiveScoring.mock.calls[0]?.[1]).toBe('m1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revision).toBe(2);
      expect(result.state.sets[0]?.teamA).toBe(1);
    }
  });

  it('returns conflict refresh hint on 409 without envelope', async () => {
    patchMatchLiveScoring.mockRejectedValue({
      response: { status: 409, data: { revision: 5 } },
    });
    const state = createInitialLiveScoringState(pointsRules);
    const result = await persistLiveScoringPatch({
      gameId: 'g1',
      matchId: 'm1',
      nextState: state,
      baseRevision: 4,
      opId: 'op-2',
      rules: pointsRules,
      rawMatchSets: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflict).toBe(true);
      expect(result.revision).toBe(5);
      expect(result.refresh).toBe(true);
    }
  });
});
