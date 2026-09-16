import { describe, expect, it } from 'vitest';
import { deriveGameType } from '@shared/isPresetLegal';
import {
  defaultMatchGenerationForParticipants,
  clampMatchGenerationType,
} from './scoringCompatibility';
import { buildGameFormatUpdatePayload } from './buildGameFormatUpdatePayload';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';

describe('defaultMatchGenerationForParticipants', () => {
  it('preserves Round Robin for tournament-sized rosters', () => {
    expect(defaultMatchGenerationForParticipants('POINTS', 8, 'ROUND_ROBIN')).toBe('ROUND_ROBIN');
    expect(defaultMatchGenerationForParticipants('CLASSIC', 16, 'ROUND_ROBIN')).toBe('ROUND_ROBIN');
  });

  it('falls back to Americano when preferred gen is illegal for roster', () => {
    expect(defaultMatchGenerationForParticipants('POINTS', 8, 'AUTOMATIC')).toBe('RANDOM');
    expect(defaultMatchGenerationForParticipants('POINTS', 4, 'ROUND_ROBIN')).toBe('AUTOMATIC');
  });

  it('keeps Random Americano when that is preferred', () => {
    expect(defaultMatchGenerationForParticipants('POINTS', 8, 'RANDOM')).toBe('RANDOM');
  });
});

describe('tournament Round Robin edit reload', () => {
  it('does not clamp Round Robin away for 8 players', () => {
    expect(clampMatchGenerationType('ROUND_ROBIN', 8)).toBe('ROUND_ROBIN');
  });

  it('derives ROUND_ROBIN gameType and persists it in format update payload', () => {
    expect(deriveGameType('POINTS', 'ROUND_ROBIN')).toBe('ROUND_ROBIN');
    const format = {
      gameType: 'ROUND_ROBIN',
      scoringMode: 'POINTS',
      scoringPreset: 'POINTS_16',
      setupPayload: {
        fixedNumberOfSets: 1,
        maxTotalPointsPerSet: 0,
        matchTimedCapMinutes: 0,
        matchTimerEnabled: false,
        maxPointsPerTeam: 0,
        winnerOfGame: 'BY_MATCHES_WON',
        winnerOfMatch: 'BY_SCORES',
        matchGenerationType: 'ROUND_ROBIN',
        pointsPerWin: 0,
        pointsPerLoose: 0,
        pointsPerTie: 0,
        ballsInGames: false,
        scoringPreset: 'POINTS_16',
        deucesBeforeGoldenPoint: null,
      },
    } as unknown as UseGameFormatResult;

    const payload = buildGameFormatUpdatePayload({
      entityType: 'TOURNAMENT',
      gameFormat: format,
      playersPerMatch: 4,
    });
    expect(payload.gameType).toBe('ROUND_ROBIN');
    expect(payload.matchGenerationType).toBe('ROUND_ROBIN');
  });
});
