import { describe, expect, it } from 'vitest';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import { formatMatchesCreateTemplate } from '@/utils/gameFormat/templateFormatCoordinator';
import { gameFormatSnapshotFromGame } from '@/utils/gameFormat/gameFormatSnapshot';

describe('gameFormatSnapshotFromGame', () => {
  it('aligns generation with template matching for small-roster americano', () => {
    const game = {
      scoringMode: 'POINTS' as const,
      scoringPreset: 'POINTS_24' as const,
      matchGenerationType: 'RANDOM' as const,
      matchTimerEnabled: false,
      winnerOfGame: 'BY_SCORES_DELTA' as const,
      maxParticipants: 4,
    };
    const snapshot = gameFormatSnapshotFromGame(game);
    expect(snapshot.generationType).toBe('AUTOMATIC');
    expect(
      formatMatchesCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, snapshot, game.maxParticipants),
    ).toBe(true);
  });

  it('aligns generation with template matching for large-roster americano', () => {
    const game = {
      scoringMode: 'POINTS' as const,
      scoringPreset: 'POINTS_32' as const,
      matchGenerationType: 'RANDOM' as const,
      matchTimerEnabled: false,
      winnerOfGame: 'BY_SCORES_DELTA' as const,
      maxParticipants: 8,
    };
    const snapshot = gameFormatSnapshotFromGame(game);
    expect(snapshot.generationType).toBe('RANDOM');
    expect(
      formatMatchesCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, snapshot, game.maxParticipants),
    ).toBe(true);
  });

  it('includes hasGoldenPoint in snapshot', () => {
    const snapshot = gameFormatSnapshotFromGame({
      hasGoldenPoint: true,
      scoringPreset: 'CLASSIC_BEST_OF_3',
      maxParticipants: 4,
    });
    expect(snapshot.hasGoldenPoint).toBe(true);
  });
});
