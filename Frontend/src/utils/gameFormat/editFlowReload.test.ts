import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { CREATE_TEMPLATES, pickDefaultTemplateId } from '@/sport/createFlow';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import { formatMatchesCreateTemplate } from '@/utils/gameFormat/createTemplateFormatMatch';
import { gameFormatSnapshotFromGame } from '@/utils/gameFormat/gameFormatSnapshot';
import { inferCreateTemplateFromGame } from '@/utils/gameFormat/inferCreateTemplateFromGame';

const PADEL_PRESETS = [
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_FAST4',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
  'POINTS_11',
  'POINTS_12',
  'POINTS_16',
  'POINTS_21',
  'POINTS_24',
  'POINTS_32',
  'TIMED',
  'CUSTOM',
] as const;

const ROSTER_4: CreateTemplateParticipantContext = {
  maxParticipants: 4,
  playersPerMatch: 4,
  hasFixedTeams: false,
  genderTeams: 'ANY',
};

const ROSTER_8: CreateTemplateParticipantContext = {
  maxParticipants: 8,
  playersPerMatch: 4,
  hasFixedTeams: false,
  genderTeams: 'ANY',
};

function participantContextKey(ctx: CreateTemplateParticipantContext): string {
  return `${ctx.maxParticipants}:${ctx.playersPerMatch}:${ctx.hasFixedTeams}:${ctx.genderTeams}`;
}

/** Mirrors edit-flow guard: no auto-pick on reload when roster unchanged. */
function editFlowSkipsAutoPickOnReload(ctx: CreateTemplateParticipantContext): boolean {
  const initialKey = participantContextKey(ctx);
  return participantContextKey(ctx) === initialKey;
}

describe('edit flow reload — template inference', () => {
  it('recognizes saved americano for large roster', () => {
    const game = {
      scoringMode: 'POINTS' as const,
      scoringPreset: 'POINTS_24' as const,
      matchGenerationType: 'RANDOM' as const,
      matchTimerEnabled: false,
      winnerOfGame: 'BY_SCORES_DELTA' as const,
      maxParticipants: 8,
    };
    const inferred = inferCreateTemplateFromGame(
      Sports.PADEL,
      [...PADEL_PRESETS],
      ROSTER_8,
      game,
    );
    expect(inferred.templateId).toBe('PADEL_AMERICANO');
    const snapshot = gameFormatSnapshotFromGame(game);
    expect(
      formatMatchesCreateTemplate(CREATE_TEMPLATES.PADEL_AMERICANO, snapshot, ROSTER_8.maxParticipants),
    ).toBe(true);
  });

  it('recognizes saved best-of-3 for small roster', () => {
    const game = {
      scoringMode: 'SETS' as const,
      scoringPreset: 'CLASSIC_BEST_OF_3' as const,
      matchGenerationType: 'AUTOMATIC' as const,
      matchTimerEnabled: false,
      winnerOfGame: 'BY_MATCHES_WON' as const,
      maxParticipants: 4,
    };
    const inferred = inferCreateTemplateFromGame(
      Sports.PADEL,
      [...PADEL_PRESETS],
      ROSTER_4,
      game,
    );
    expect(inferred.templateId).toBe('PADEL_BEST_OF_3');
  });

  it('recognizes saved timed template', () => {
    const game = {
      scoringMode: 'SETS' as const,
      scoringPreset: 'CLASSIC_TIMED' as const,
      matchGenerationType: 'AUTOMATIC' as const,
      matchTimerEnabled: true,
      matchTimedCapMinutes: 15,
      winnerOfGame: 'BY_MATCHES_WON' as const,
      maxParticipants: 4,
    };
    const inferred = inferCreateTemplateFromGame(
      Sports.PADEL,
      [...PADEL_PRESETS],
      ROSTER_4,
      game,
    );
    expect(inferred.templateId).toBe('PADEL_TIMED');
  });

  it('returns advanced for custom points preset', () => {
    const inferred = inferCreateTemplateFromGame(
      Sports.PADEL,
      [...PADEL_PRESETS],
      ROSTER_4,
      {
        scoringPreset: 'CUSTOM',
        scoringMode: 'SETS',
        maxTotalPointsPerSet: 25,
        maxParticipants: 4,
      },
    );
    expect(inferred.intent).toBe('advanced');
    expect(inferred.templateId).toBeNull();
  });

  it('returns advanced for wizard-only preset not matching a template card', () => {
    const inferred = inferCreateTemplateFromGame(
      Sports.PADEL,
      [...PADEL_PRESETS],
      ROSTER_4,
      {
        scoringPreset: 'CLASSIC_SUPER_TIEBREAK',
        scoringMode: 'SETS',
        matchGenerationType: 'AUTOMATIC',
        matchTimerEnabled: false,
        winnerOfGame: 'BY_MATCHES_WON',
        maxParticipants: 4,
      },
    );
    expect(inferred.intent).toBe('advanced');
    expect(inferred.templateId).toBeNull();
  });
});

describe('edit flow reload — auto-pick guard', () => {
  it('skips auto-pick when roster unchanged (page reload)', () => {
    expect(editFlowSkipsAutoPickOnReload(ROSTER_8)).toBe(true);
  });

  it('does not reset saved americano to default best-of-3 on reload', () => {
    const inferred = inferCreateTemplateFromGame(
      Sports.PADEL,
      [...PADEL_PRESETS],
      ROSTER_8,
      {
        scoringMode: 'POINTS',
        scoringPreset: 'POINTS_21',
        matchGenerationType: 'RANDOM',
        winnerOfGame: 'BY_SCORES_DELTA',
        maxParticipants: 8,
      },
    );
    expect(inferred.templateId).toBe('PADEL_AMERICANO');
    expect(editFlowSkipsAutoPickOnReload(ROSTER_8)).toBe(true);

    const autoPick = pickDefaultTemplateId(
      Sports.PADEL,
      [...PADEL_PRESETS],
      ROSTER_8,
      inferred.templateId,
    );
    expect(autoPick).toBe('PADEL_AMERICANO');
    expect(autoPick).not.toBe('PADEL_BEST_OF_3');
  });

  it('allows auto-pick when roster shape changes', () => {
    const initial = ROSTER_4;
    const afterEdit: CreateTemplateParticipantContext = { ...ROSTER_4, maxParticipants: 8 };
    expect(participantContextKey(initial)).not.toBe(participantContextKey(afterEdit));
  });
});
