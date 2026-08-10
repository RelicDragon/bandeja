// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type {
  GameLevelEvaluationPlayer,
  GameLevelEvaluations,
  PlayerLevelVerdict,
} from '@/api/results';
import {
  findNextFeedbackIndex,
  findNextUnansweredIndex,
  isPlayerLevelFeedbackEnabled,
  loadLevelEvaluationsWithRetry,
  runLevelFeedbackRequestWithRetry,
} from './player-level-feedback';
import {
  PLAYER_LEVEL_FEEDBACK_METRIC_EVENT,
  recordPlayerLevelFeedbackMetric,
  type PlayerLevelFeedbackMetricDetail,
} from '@/services/player-level-feedback-metrics';

function player(id: string, verdict: PlayerLevelVerdict | null): GameLevelEvaluationPlayer {
  return {
    user: { id, firstName: id },
    levelSnapshot: 3,
    verdict,
    updatedAt: null,
  };
}

const response: GameLevelEvaluations = {
  sport: 'PADEL',
  canEdit: true,
  editableUntil: new Date().toISOString(),
  completedCount: 0,
  players: [],
};

function axiosError(status?: number): Error & { isAxiosError: true; response?: { status: number } } {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true as const,
    response: status === undefined ? undefined : { status },
  });
}

describe('player level feedback flow', () => {
  it('returns to a previously skipped player before showing completion', () => {
    const players = [player('A', 'HIGHER'), player('B', null), player('C', 'LOWER')];
    expect(findNextFeedbackIndex(players, 2, false)).toBe(1);
  });

  it('does not loop back to the current player when it is the only unanswered one', () => {
    const players = [player('A', 'HIGHER'), player('B', null), player('C', 'LOWER')];
    expect(findNextUnansweredIndex(players, 1)).toBeNull();
  });

  it('walks an already-completed set in display order for editing', () => {
    const players = [player('A', 'HIGHER'), player('B', 'ABOUT_RIGHT')];
    expect(findNextFeedbackIndex(players, 0, true)).toBe(1);
    expect(findNextFeedbackIndex(players, 1, true)).toBeNull();
  });
});

describe('player level feedback loading', () => {
  it('retries transient failures twice and then succeeds', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(axiosError(503))
      .mockRejectedValueOnce(axiosError())
      .mockResolvedValue(response);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(loadLevelEvaluationsWithRetry(load, sleep)).resolves.toBe(response);
    expect(load).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [750]]);
  });

  it('does not retry authorization or eligibility responses', async () => {
    const error = axiosError(403);
    const load = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(loadLevelEvaluationsWithRetry(load, sleep)).rejects.toBe(error);
    expect(load).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('uses the same safe retry policy for idempotent saves', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(axiosError(502))
      .mockResolvedValue({ saved: true });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(runLevelFeedbackRequestWithRetry(save, sleep)).resolves.toEqual({ saved: true });
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('player level feedback rollout controls', () => {
  it('is enabled by default and supports explicit operational kill switches', () => {
    expect(isPlayerLevelFeedbackEnabled(undefined)).toBe(true);
    expect(isPlayerLevelFeedbackEnabled('true')).toBe(true);
    expect(isPlayerLevelFeedbackEnabled('0')).toBe(false);
    expect(isPlayerLevelFeedbackEnabled('FALSE')).toBe(false);
    expect(isPlayerLevelFeedbackEnabled(' off ')).toBe(false);
  });

  it('emits anonymous product metrics without game, user, target, or verdict data', () => {
    const received: PlayerLevelFeedbackMetricDetail[] = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<PlayerLevelFeedbackMetricDetail>).detail);
    };
    window.addEventListener(PLAYER_LEVEL_FEEDBACK_METRIC_EVENT, listener);

    recordPlayerLevelFeedbackMetric({ event: 'completed', completedCount: 3, totalCount: 3 });

    window.removeEventListener(PLAYER_LEVEL_FEEDBACK_METRIC_EVENT, listener);
    expect(received).toEqual([{ event: 'completed', completedCount: 3, totalCount: 3 }]);
    expect(JSON.stringify(received)).not.toMatch(/game|user|target|verdict|higher|lower/i);
  });
});
