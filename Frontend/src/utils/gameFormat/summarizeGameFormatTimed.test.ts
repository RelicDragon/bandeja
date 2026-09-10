import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { summarizeGameFormat } from './summarizeGameFormat';

const t = ((key: string) => key) as unknown as TFunction;

describe('summarizeGameFormat timed no-target', () => {
  it('labels the timed shape instead of the suspended preset', () => {
    const summary = summarizeGameFormat(
      t,
      {
        scoringMode: 'POINTS',
        scoringPreset: 'POINTS_16',
        customPointsTotal: null,
        matchTimerEnabled: true,
        matchTimedCapMinutes: 14,
        winnerOfGame: 'BY_SCORES_DELTA',
      },
      'PADEL',
    );
    expect(summary).toContain('TIMED');
    expect(summary).not.toContain('POINTS_16');
  });

  it('untimed labels are unchanged', () => {
    const summary = summarizeGameFormat(
      t,
      {
        scoringMode: 'POINTS',
        scoringPreset: 'POINTS_16',
        customPointsTotal: null,
        matchTimerEnabled: false,
        matchTimedCapMinutes: 0,
        winnerOfGame: 'BY_SCORES_DELTA',
      },
      'PADEL',
    );
    expect(summary).toContain('POINTS_16');
    expect(summary).not.toContain('TIMED');
  });
});
