import { describe, expect, it } from 'vitest';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import { formatMatchesCreateTemplate } from './createTemplateFormatMatch';

const bo3Format = {
  scoringMode: 'SETS' as const,
  scoringPreset: 'CLASSIC_BEST_OF_3' as const,
  matchTimerEnabled: false,
  customPointsTotal: null,
  winnerOfGame: 'BY_MATCHES_WON' as const,
};

describe('formatMatchesCreateTemplate', () => {
  it('padel best of 3 expects AUTOMATIC at 4 players and RANDOM at 8', () => {
    const tpl = CREATE_TEMPLATES.PADEL_BEST_OF_3;
    expect(
      formatMatchesCreateTemplate(tpl, { ...bo3Format, generationType: 'AUTOMATIC' }, 4),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...bo3Format, generationType: 'RANDOM' }, 8),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...bo3Format, generationType: 'AUTOMATIC' }, 8),
    ).toBe(false);
  });

  it('badminton Bo3 club template matches after apply-style snapshot', () => {
    const tpl = CREATE_TEMPLATES.BADMINTON_CLUB_3X21;
    const snapshot = {
      scoringMode: 'POINTS' as const,
      scoringPreset: 'BEST_OF_3_21' as const,
      generationType: 'AUTOMATIC' as const,
      matchTimerEnabled: false,
      matchTimedCapMinutes: 15,
      customPointsTotal: null,
      winnerOfGame: 'BY_MATCHES_WON' as const,
      hasGoldenPoint: false,
    };
    expect(formatMatchesCreateTemplate(tpl, snapshot, 4)).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...snapshot, winnerOfGame: 'BY_SCORES_DELTA' }, 4),
    ).toBe(false);
  });

  it('padel americano accepts any POINTS_ preset', () => {
    const tpl = CREATE_TEMPLATES.PADEL_AMERICANO;
    const base = {
      scoringMode: 'POINTS' as const,
      matchTimerEnabled: false,
      customPointsTotal: null,
      winnerOfGame: 'BY_SCORES_DELTA' as const,
      generationType: 'AUTOMATIC' as const,
    };
    expect(
      formatMatchesCreateTemplate(tpl, { ...base, scoringPreset: 'POINTS_24' }, 4),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...base, scoringPreset: 'POINTS_21' }, 4),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...base, scoringPreset: 'POINTS_32' }, 4),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...base, scoringPreset: 'POINTS_32', generationType: 'RANDOM' }, 8),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...base, scoringPreset: 'POINTS_32', generationType: 'AUTOMATIC' }, 8),
    ).toBe(false);
  });
});
