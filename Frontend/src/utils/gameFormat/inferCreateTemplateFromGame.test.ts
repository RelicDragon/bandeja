import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { inferCreateTemplateFromGame } from './inferCreateTemplateFromGame';

describe('inferCreateTemplateFromGame', () => {
  it('recognizes padel best of 3', () => {
    const { templateId } = inferCreateTemplateFromGame(
      Sports.PADEL,
      ['CLASSIC_BEST_OF_3', 'CLASSIC_SINGLE_SET', 'POINTS_16', 'CLASSIC_TIMED', 'CUSTOM'],
      { maxParticipants: 4, playersPerMatch: 4, hasFixedTeams: false },
      {
        scoringPreset: 'CLASSIC_BEST_OF_3',
        scoringMode: 'SETS',
        matchGenerationType: 'AUTOMATIC',
        matchTimerEnabled: false,
        winnerOfGame: 'BY_MATCHES_WON',
      },
    );
    expect(templateId).toBe('PADEL_BEST_OF_3');
  });

  it('returns advanced for custom preset', () => {
    const { intent, templateId } = inferCreateTemplateFromGame(
      Sports.PADEL,
      ['CLASSIC_BEST_OF_3', 'CUSTOM'],
      { maxParticipants: 4, playersPerMatch: 4, hasFixedTeams: false },
      { scoringPreset: 'CUSTOM', scoringMode: 'SETS' },
    );
    expect(intent).toBe('advanced');
    expect(templateId).toBeNull();
  });
});
