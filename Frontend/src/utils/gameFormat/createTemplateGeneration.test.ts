import { describe, expect, it, vi } from 'vitest';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import {
  isAmericanoGeneration,
  resolveCreateTemplateGeneration,
} from '@/utils/gameFormat/createTemplateGeneration';
import { formatMatchesCreateTemplate } from '@/utils/gameFormat/templateFormatCoordinator';
import { applyCreateTemplate } from '@/utils/gameFormat/applyCreateTemplate';
import { gameFormatSnapshotFromFormat } from '@/utils/gameFormat/gameFormatSnapshot';
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

describe('resolveCreateTemplateGeneration', () => {
  it('uses automatic matches for <= 5 players', () => {
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_BEST_OF_3, 4)).toBe('AUTOMATIC');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_AMERICANO, 5)).toBe('AUTOMATIC');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_MEXICANO_24, 5)).toBe('AUTOMATIC');
  });

  it('honors template matchGenerationType for larger rosters', () => {
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_AMERICANO, 8)).toBe('RANDOM');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_MEXICANO_24, 8)).toBe('RATING');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_KOTC_11, 12)).toBe('KING_OF_COURT');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.TT_BOX_BO3_11, 12)).toBe('ESCALERA');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.TT_CLUB_RR_11, 8)).toBe('ROUND_ROBIN');
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES.PADEL_BEST_OF_3, 8)).toBe('AUTOMATIC');
    expect(isAmericanoGeneration('RANDOM')).toBe(true);
  });

  it.each([
    ['PADEL_AMERICANO', 'RANDOM'],
    ['BADMINTON_AMERICANO_21', 'RANDOM'],
    ['TT_AMERICANO_11', 'RANDOM'],
    ['PADEL_MEXICANO_24', 'RATING'],
    ['TT_MEXICANO_11', 'RATING'],
    ['PADEL_KOTC_11', 'KING_OF_COURT'],
    ['PICKLEBALL_KOTC_11', 'KING_OF_COURT'],
    ['TT_BOX_BO3_11', 'ESCALERA'],
    ['TT_SWISS_BOX', 'ESCALERA'],
    ['TT_CLUB_RR_11', 'ROUND_ROBIN'],
    ['TENNIS_CLASSIC_BO3', 'AUTOMATIC'],
  ] as const)('resolves %s to %s at roster 8', (id, expected) => {
    expect(resolveCreateTemplateGeneration(CREATE_TEMPLATES[id], 8)).toBe(expected);
  });
});

describe('formatMatchesCreateTemplate round-trip', () => {
  it.each([
    'PADEL_AMERICANO',
    'PADEL_MEXICANO_24',
    'PADEL_KOTC_11',
    'TT_BOX_BO3_11',
    'TT_CLUB_RR_11',
    'BADMINTON_AMERICANO_21',
    'TENNIS_CLASSIC_BO3',
  ] as const)('apply → snapshot → match for %s', (templateId) => {
    const tpl = CREATE_TEMPLATES[templateId];
    const roster = Math.max(8, tpl.suggestedMaxParticipants);
    const format = mockFormat();
    applyCreateTemplate(tpl, format, roster);

    const lastCall = <T,>(fn: ReturnType<typeof vi.fn>): T | undefined =>
      fn.mock.calls.at(-1)?.[0] as T | undefined;

    const snapshot = gameFormatSnapshotFromFormat({
      ...format,
      scoringPreset: lastCall(format.setScoringPreset) ?? tpl.scoringPreset,
      scoringMode: lastCall(format.setScoringMode) ?? format.scoringMode,
      generationType: lastCall(format.setGenerationType) ?? resolveCreateTemplateGeneration(tpl, roster),
      winnerOfGame: lastCall<{ winnerOfGame: UseGameFormatResult['winnerOfGame'] }>(format.setRanking)
        ?.winnerOfGame ?? format.winnerOfGame,
      matchTimerEnabled: tpl.matchTimerEnabled ?? false,
      matchTimedCapMinutes:
        lastCall(format.setMatchTimedCapMinutes) ?? tpl.matchTimedCapMinutes ?? 15,
    });
    expect(formatMatchesCreateTemplate(tpl, snapshot, roster)).toBe(true);
  });

  it('matches padel americano points preset at large roster', () => {
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

  it('padel best of 3 expects AUTOMATIC at 4 players and template metadata at 8', () => {
    const tpl = CREATE_TEMPLATES.PADEL_BEST_OF_3;
    const bo3Format = {
      scoringMode: 'SETS' as const,
      scoringPreset: 'CLASSIC_BEST_OF_3' as const,
      matchTimerEnabled: false,
      customPointsTotal: null,
      winnerOfGame: 'BY_MATCHES_WON' as const,
    };
    expect(
      formatMatchesCreateTemplate(tpl, { ...bo3Format, generationType: 'AUTOMATIC' }, 4),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...bo3Format, generationType: 'AUTOMATIC' }, 8),
    ).toBe(true);
    expect(
      formatMatchesCreateTemplate(tpl, { ...bo3Format, generationType: 'RANDOM' }, 8),
    ).toBe(false);
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
