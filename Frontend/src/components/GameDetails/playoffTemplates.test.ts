import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { inferTemplateFromFormat } from '@/utils/gameFormat/templateFormatCoordinator';
import {
  bracketPlayoffFormatInitialFromSeason,
  bracketPlayoffFormatSnapshot,
} from './playoffTemplates';

describe('bracketPlayoffFormatInitialFromSeason', () => {
  it('uses singles fixture capacity while preserving season format', () => {
    const initial = bracketPlayoffFormatInitialFromSeason({
      maxParticipants: 16,
      playersPerMatch: 2,
      scoringPreset: 'CLASSIC_SINGLE_SET',
      matchGenerationType: 'HANDMADE',
    });

    expect(initial).toMatchObject({
      maxParticipants: 2,
      playersPerMatch: 2,
      scoringPreset: 'CLASSIC_SINGLE_SET',
      matchGenerationType: 'HANDMADE',
    });
  });

  it('uses doubles fixture capacity while preserving season format', () => {
    const initial = bracketPlayoffFormatInitialFromSeason({
      maxParticipants: 24,
      playersPerMatch: 4,
      scoringPreset: 'CLASSIC_BEST_OF_3',
      matchGenerationType: 'AUTOMATIC',
    });

    expect(initial).toMatchObject({
      maxParticipants: 4,
      playersPerMatch: 4,
      scoringPreset: 'CLASSIC_BEST_OF_3',
      matchGenerationType: 'AUTOMATIC',
    });
  });

  it('restores confirmed setup over season defaults', () => {
    const initial = bracketPlayoffFormatInitialFromSeason(
      {
        maxParticipants: 24,
        playersPerMatch: 4,
        scoringPreset: 'CLASSIC_BEST_OF_3',
        matchGenerationType: 'HANDMADE',
        scoringMode: 'CLASSIC',
      },
      {
        fixedNumberOfSets: 1,
        maxTotalPointsPerSet: 0,
        matchTimedCapMinutes: 0,
        maxPointsPerTeam: 0,
        winnerOfGame: 'BY_MATCHES_WON',
        winnerOfMatch: 'BY_SCORES',
        matchGenerationType: 'AUTOMATIC',
        pointsPerWin: 0,
        pointsPerLoose: 0,
        pointsPerTie: 0,
        ballsInGames: false,
        scoringPreset: 'CLASSIC_SUPER_TIEBREAK',
        scoringMode: 'CLASSIC',
      },
    );

    expect(initial).toMatchObject({
      maxParticipants: 4,
      scoringPreset: 'CLASSIC_SUPER_TIEBREAK',
      matchGenerationType: 'AUTOMATIC',
      scoringMode: 'CLASSIC',
    });
  });

  it('preselects the matching GAME template from season defaults', () => {
    const initial = bracketPlayoffFormatInitialFromSeason({
      sport: Sports.PADEL,
      maxParticipants: 16,
      playersPerMatch: 4,
      scoringMode: 'CLASSIC',
      scoringPreset: 'CLASSIC_BEST_OF_3',
      matchGenerationType: 'AUTOMATIC',
      winnerOfGame: 'BY_MATCHES_WON',
    });

    const selection = inferTemplateFromFormat(
      {
        sport: Sports.PADEL,
        maxParticipants: 4,
        entityType: 'GAME',
        allowedScoringPresets: ['CLASSIC_BEST_OF_3'],
        participantContext: {
          maxParticipants: 4,
          playersPerMatch: 4,
          hasFixedTeams: true,
          genderTeams: 'ANY',
          lockPlayersPerMatch: true,
        },
      },
      initial,
      bracketPlayoffFormatSnapshot(initial),
    );

    expect(selection).toEqual({
      intent: 'match',
      templateId: 'PADEL_BEST_OF_3',
    });
  });

  it('keeps unmatched handmade season defaults as Custom', () => {
    const initial = bracketPlayoffFormatInitialFromSeason({
      sport: Sports.PADEL,
      playersPerMatch: 4,
      scoringMode: 'CLASSIC',
      scoringPreset: 'CLASSIC_BEST_OF_3',
      matchGenerationType: 'HANDMADE',
      winnerOfGame: 'BY_MATCHES_WON',
    });

    expect(bracketPlayoffFormatSnapshot(initial).generationType).toBe('HANDMADE');

    const selection = inferTemplateFromFormat(
      {
        sport: Sports.PADEL,
        maxParticipants: 4,
        entityType: 'GAME',
        allowedScoringPresets: ['CLASSIC_BEST_OF_3'],
        participantContext: {
          maxParticipants: 4,
          playersPerMatch: 4,
          hasFixedTeams: true,
          genderTeams: 'ANY',
          lockPlayersPerMatch: true,
        },
      },
      initial,
      bracketPlayoffFormatSnapshot(initial),
    );

    expect(selection).toEqual({ intent: 'advanced', templateId: null });
  });
});
