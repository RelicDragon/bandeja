import { describe, expect, it, vi } from 'vitest';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import { applyCreateTemplate } from '@/utils/gameFormat/applyCreateTemplate';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';

function mockFormat(overrides: Partial<UseGameFormatResult> = {}): UseGameFormatResult {
  return {
    scoringMode: 'CLASSIC',
    scoringPreset: 'CLASSIC_BEST_OF_3',
    generationType: 'AUTOMATIC',
    deucesBeforeGoldenPoint: null,
    pointsPerWin: 0,
    pointsPerLoose: 0,
    pointsPerTie: 0,
    winnerOfGame: 'BY_MATCHES_WON',
    overrides: {},
    customPointsTotal: null,
    matchTimerEnabled: false,
    matchTimedCapMinutes: 15,
    gameType: 'CLASSIC',
    setupPayload: {} as UseGameFormatResult['setupPayload'],
    setScoringMode: vi.fn(),
    setScoringPreset: vi.fn(),
    setGenerationType: vi.fn(),
    setHasGoldenPoint: vi.fn(),
    setCustomPointsTotal: vi.fn(),
    setMatchTimerEnabled: vi.fn(),
    setMatchTimedCapMinutes: vi.fn(),
    setRanking: vi.fn(),
    setOverrides: vi.fn(),
    resetOverrides: vi.fn(),
    ...overrides,
  };
}

describe('applyCreateTemplate', () => {
  it('keeps matches-won ranking for classic templates with large rosters', () => {
    const format = mockFormat();
    applyCreateTemplate(CREATE_TEMPLATES.PADEL_BEST_OF_3, format, 8);
    expect(format.setGenerationType).toHaveBeenCalledWith('AUTOMATIC');
    expect(format.setRanking).toHaveBeenCalledWith(
      expect.objectContaining({ winnerOfGame: 'BY_MATCHES_WON' }),
    );
  });

  it('uses scores-delta ranking for americano templates', () => {
    const format = mockFormat();
    applyCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, format, 8);
    expect(format.setRanking).toHaveBeenCalledWith(
      expect.objectContaining({ winnerOfGame: 'BY_SCORES_DELTA' }),
    );
  });

  it('preserves selected americano points preset', () => {
    const format = mockFormat({
      scoringMode: 'POINTS',
      scoringPreset: 'POINTS_21',
      winnerOfGame: 'BY_SCORES_DELTA',
    });
    applyCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, format, 8);
    expect(format.setScoringPreset).not.toHaveBeenCalled();
  });

  it('uses matches-won ranking for rally Bo3 classic templates', () => {
    const format = mockFormat();
    applyCreateTemplate(CREATE_TEMPLATES.BADMINTON_CLUB_3X21, format, 4);
    expect(format.setScoringPreset).toHaveBeenCalledWith('BEST_OF_3_21');
    expect(format.setRanking).toHaveBeenCalledWith(
      expect.objectContaining({ winnerOfGame: 'BY_MATCHES_WON' }),
    );
  });

  it('uses timed cap override instead of stale format state', () => {
    const format = mockFormat({
      matchTimerEnabled: true,
      matchTimedCapMinutes: 15,
    });
    applyCreateTemplate(CREATE_TEMPLATES.PADEL_TIMED, format, 8, { matchTimedCapMinutes: 20 });
    expect(format.setMatchTimedCapMinutes).toHaveBeenCalledWith(20);
  });
});
