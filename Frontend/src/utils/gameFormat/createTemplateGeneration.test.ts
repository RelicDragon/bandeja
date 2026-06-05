import { describe, expect, it } from 'vitest';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import {
  isAmericanoGeneration,
  resolveCreateTemplateGeneration,
} from '@/utils/gameFormat/createTemplateGeneration';
import { formatMatchesCreateTemplate } from '@/utils/gameFormat/createTemplateFormatMatch';

describe('createTemplateGeneration', () => {
  it('uses automatic matches for <= 5 players', () => {
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_BEST_OF_3, 4)).toBe('AUTOMATIC');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_AMERICANO, 5)).toBe('AUTOMATIC');
  });

  it('uses random rotation for larger rosters', () => {
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_BEST_OF_3, 8)).toBe('RANDOM');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_AMERICANO, 8)).toBe('RANDOM');
    expect(isAmericanoGeneration('RANDOM')).toBe(true);
  });
});

describe('formatMatchesCreateTemplate', () => {
  it('matches padel americano points preset', () => {
    expect(
      formatMatchesCreateTemplate(
        CREATE_TEMPLATES.PADEL_AMERICANO,
        {
          scoringMode: 'POINTS',
          scoringPreset: 'POINTS_21',
          generationType: 'RANDOM',
          matchTimerEnabled: false,
          matchTimedCapMinutes: 15,
          customPointsTotal: null,
          winnerOfGame: 'BY_SCORES_DELTA',
        },
        8,
      ),
    ).toBe(true);
  });

  it('matches padel timed template for allowed durations', () => {
    expect(
      formatMatchesCreateTemplate(
        CREATE_TEMPLATES.PADEL_TIMED,
        {
          scoringMode: 'CLASSIC',
          scoringPreset: 'CLASSIC_TIMED',
          generationType: 'AUTOMATIC',
          matchTimerEnabled: true,
          matchTimedCapMinutes: 10,
          customPointsTotal: null,
          winnerOfGame: 'BY_MATCHES_WON',
        },
        4,
      ),
    ).toBe(true);
  });

  it('matches classic best-of-3 with large roster rotation', () => {
    expect(
      formatMatchesCreateTemplate(
        CREATE_TEMPLATES.PADEL_BEST_OF_3,
        {
          scoringMode: 'CLASSIC',
          scoringPreset: 'CLASSIC_BEST_OF_3',
          generationType: 'RANDOM',
          matchTimerEnabled: false,
          matchTimedCapMinutes: 15,
          customPointsTotal: null,
          winnerOfGame: 'BY_MATCHES_WON',
        },
        8,
      ),
    ).toBe(true);
  });

  it('does not match best-of-3 when super tiebreak preset chosen', () => {
    expect(
      formatMatchesCreateTemplate(
        CREATE_TEMPLATES.PADEL_BEST_OF_3,
        {
          scoringMode: 'CLASSIC',
          scoringPreset: 'CLASSIC_SUPER_TIEBREAK',
          generationType: 'AUTOMATIC',
          matchTimerEnabled: false,
          matchTimedCapMinutes: 15,
          customPointsTotal: null,
          winnerOfGame: 'BY_MATCHES_WON',
        },
        4,
      ),
    ).toBe(false);
  });
});
