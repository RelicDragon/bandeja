import { describe, expect, it, vi } from 'vitest';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import { Sports } from '@shared/sport';
import {
  buildCreateBootstrap,
  evaluateParticipantRepick,
  evaluateSportChange,
  evaluateWizardClose,
  findMatchingTemplateId,
  formatMatchesCreateTemplate,
  inferTemplateFromFormat,
  snapshotsEqual,
  syncSelectionFromFormat,
  type TemplateFormatCoordinatorContext,
} from '@/utils/gameFormat/templateFormatCoordinator';
import { gameFormatSnapshotFromFormat } from '@/utils/gameFormat/gameFormatSnapshot';

const PADEL_CTX: TemplateFormatCoordinatorContext = {
  sport: Sports.PADEL,
  maxParticipants: 4,
  entityType: 'GAME',
  allowedScoringPresets: [
    'CLASSIC_AUTOMATIC',
    'CLASSIC_BEST_OF_3',
    'CLASSIC_SINGLE_SET',
    'CLASSIC_TIMED',
    'POINTS_24',
    'POINTS_32',
    'POINTS_21',
  ],
  participantContext: {
    maxParticipants: 4,
    playersPerMatch: 4,
    hasFixedTeams: false,
    genderTeams: 'ANY',
  },
};

function mockFormat(overrides: Partial<UseGameFormatResult> = {}): UseGameFormatResult {
  return {
    scoringMode: 'SETS',
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

describe('templateFormatCoordinator', () => {
  describe('create bootstrap', () => {
    it('bootstraps padel best of 3 from initial intent + template id', () => {
      const bootstrap = buildCreateBootstrap('match', 'PADEL_BEST_OF_3', 4);
      expect(bootstrap.selection).toEqual({ intent: 'match', templateId: 'PADEL_BEST_OF_3' });
      expect(bootstrap.appliedKey).toBe('PADEL_BEST_OF_3:4');
      expect(bootstrap.flags.userChoseManual).toBe(false);
    });

    it('bootstraps custom when intent is advanced without template', () => {
      const bootstrap = buildCreateBootstrap('advanced', null, 4);
      expect(bootstrap.selection).toEqual({ intent: 'advanced', templateId: null });
      expect(bootstrap.flags.userChoseManual).toBe(true);
    });
  });

  describe('edit bootstrap via inferTemplateFromFormat', () => {
    it('infers padel automatic from CLASSIC_AUTOMATIC format at 4 players', () => {
      const format = mockFormat({
        scoringPreset: 'CLASSIC_AUTOMATIC',
        generationType: 'AUTOMATIC',
      });
      const inferred = inferTemplateFromFormat(PADEL_CTX, format);
      expect(inferred.templateId).toBe('PADEL_AUTOMATIC');
      expect(inferred.intent).toBe('social');
    });

    it('infers padel americano from POINTS_32 automatic format at 4 players', () => {
      const format = mockFormat({
        scoringMode: 'POINTS',
        scoringPreset: 'POINTS_32',
        generationType: 'AUTOMATIC',
        winnerOfGame: 'BY_SCORES_DELTA',
      });
      const inferred = inferTemplateFromFormat(PADEL_CTX, format);
      expect(inferred.templateId).toBe('PADEL_AMERICANO');
      expect(inferred.intent).toBe('social');
    });

    it('infers custom when format does not match any template', () => {
      const format = mockFormat({ scoringPreset: 'CLASSIC_SUPER_TIEBREAK' });
      const inferred = inferTemplateFromFormat(PADEL_CTX, format);
      expect(inferred).toEqual({ intent: 'advanced', templateId: null });
    });
  });

  describe('wizard drift', () => {
    it('demotes to custom when wizard changed preset away from selected template', () => {
      const selection = { intent: 'match' as const, templateId: 'PADEL_BEST_OF_3' as const };
      const afterWizard = mockFormat({
        scoringPreset: 'CLASSIC_SINGLE_SET',
        generationType: 'AUTOMATIC',
      });
      const result = evaluateWizardClose(PADEL_CTX, afterWizard, selection, {
        userChoseManual: false,
      });
      expect(result.type).toBe('demote');
    });

    it('restores template match when wizard edits are reverted', () => {
      const selection = { intent: 'match' as const, templateId: 'PADEL_BEST_OF_3' as const };
      const reverted = mockFormat({ scoringPreset: 'CLASSIC_BEST_OF_3', generationType: 'AUTOMATIC' });
      const result = evaluateWizardClose(PADEL_CTX, reverted, selection, {
        userChoseManual: false,
      });
      expect(result.type).toBe('unchanged');
      expect(
        formatMatchesCreateTemplate(
          CREATE_TEMPLATES.PADEL_BEST_OF_3,
          gameFormatSnapshotFromFormat(reverted),
          4,
        ),
      ).toBe(true);
    });

    it('keeps americano template when wizard changes points within inlineConfig', () => {
      const selection = { intent: 'social' as const, templateId: 'PADEL_AMERICANO' as const };
      const afterWizard = mockFormat({
        scoringMode: 'POINTS',
        scoringPreset: 'POINTS_21',
        generationType: 'AUTOMATIC',
        winnerOfGame: 'BY_SCORES_DELTA',
      });
      const result = evaluateWizardClose(PADEL_CTX, afterWizard, selection, {
        userChoseManual: false,
      });
      expect(result.type).toBe('unchanged');
    });

    it('keeps timed template when wizard changes duration within inlineConfig options', () => {
      const selection = { intent: 'social' as const, templateId: 'PADEL_TIMED' as const };
      const afterWizard = mockFormat({
        scoringPreset: 'CLASSIC_TIMED',
        matchTimerEnabled: true,
        matchTimedCapMinutes: 10,
      });
      const result = evaluateWizardClose(PADEL_CTX, afterWizard, selection, {
        userChoseManual: false,
      });
      expect(result.type).toBe('unchanged');
    });
  });

  describe('sport change', () => {
    it('repicks default template for new sport when not skipping auto-select', () => {
      const tennisCtx: TemplateFormatCoordinatorContext = {
        sport: Sports.TENNIS,
        maxParticipants: 4,
        allowedScoringPresets: ['CLASSIC_BEST_OF_3', 'CLASSIC_FAST4', 'CLASSIC_TIMED'],
        participantContext: {
          maxParticipants: 4,
          playersPerMatch: 2,
          hasFixedTeams: false,
          genderTeams: 'ANY',
        },
      };
      const result = evaluateSportChange(tennisCtx, { skipInitialAutoSelect: false });
      expect(result.type).toBe('repick');
      if (result.type === 'repick') {
        expect(result.selection.templateId).toBe('TENNIS_FAST4_SOCIAL');
      }
    });

    it('demotes when skipInitialAutoSelect is set (edit reload)', () => {
      const result = evaluateSportChange(PADEL_CTX, { skipInitialAutoSelect: true });
      expect(result.type).toBe('demote');
    });
  });

  describe('participant change', () => {
    it('skips repick while wizard is open', () => {
      const selection = { intent: 'social' as const, templateId: 'PADEL_AMERICANO' as const };
      const ctx8: TemplateFormatCoordinatorContext = {
        ...PADEL_CTX,
        maxParticipants: 8,
        participantContext: { ...PADEL_CTX.participantContext, maxParticipants: 8 },
      };
      const repick = evaluateParticipantRepick(ctx8, selection, {
        userChoseManual: false,
        explicitTemplatePick: false,
        bootstrapped: true,
        skipInitialAutoSelect: false,
        formatWizardOpen: true,
        initialParticipantContextKey: null,
      });
      expect(repick.type).toBe('skip');
    });

    it('re-evaluates template fit when roster grows past automatic threshold', () => {
      const format = mockFormat({
        scoringMode: 'POINTS',
        scoringPreset: 'POINTS_32',
        generationType: 'RANDOM',
        winnerOfGame: 'BY_SCORES_DELTA',
      });
      const ctx8: TemplateFormatCoordinatorContext = {
        ...PADEL_CTX,
        maxParticipants: 8,
        participantContext: { ...PADEL_CTX.participantContext, maxParticipants: 8 },
      };
      expect(findMatchingTemplateId(ctx8, format)).toBe('PADEL_AMERICANO');
      const sync = syncSelectionFromFormat(
        ctx8,
        format,
        { intent: 'social', templateId: 'PADEL_AMERICANO' },
        { userChoseManual: false },
      );
      expect(sync.type).toBe('unchanged');
    });
  });

  describe('explicit template pick', () => {
    it('marks explicit pick and applied key for template bootstrap', () => {
      const bootstrap = buildCreateBootstrap('social', 'PADEL_AMERICANO', 8);
      expect(bootstrap.selection).toEqual({ intent: 'social', templateId: 'PADEL_AMERICANO' });
      expect(bootstrap.flags.explicitTemplatePick).toBe(true);
      expect(bootstrap.appliedKey).toBe('PADEL_AMERICANO:8');
    });
  });

  describe('manual edit promote', () => {
    it('promotes back to matching template after manual advanced drift', () => {
      const format = mockFormat({
        scoringMode: 'POINTS',
        scoringPreset: 'POINTS_32',
        generationType: 'RANDOM',
        winnerOfGame: 'BY_SCORES_DELTA',
      });
      const ctx8: TemplateFormatCoordinatorContext = {
        ...PADEL_CTX,
        maxParticipants: 8,
        participantContext: { ...PADEL_CTX.participantContext, maxParticipants: 8 },
      };
      const sync = syncSelectionFromFormat(
        ctx8,
        format,
        { intent: 'advanced', templateId: null },
        { userChoseManual: false },
      );
      expect(sync.type).toBe('promote');
      if (sync.type === 'promote') {
        expect(sync.selection.templateId).toBe('PADEL_AMERICANO');
        expect(sync.selection.intent).toBe('social');
      }
    });

    it('keeps locked manual selection when user explicitly chose custom', () => {
      const format = mockFormat({ scoringPreset: 'CLASSIC_SUPER_TIEBREAK' });
      const sync = syncSelectionFromFormat(
        PADEL_CTX,
        format,
        { intent: 'advanced', templateId: null },
        { userChoseManual: true },
      );
      expect(sync.type).toBe('unchanged');
    });
  });

  describe('participant context change', () => {
    it('repicks singles Automatic when doubles template no longer fits', () => {
      const selection = { intent: 'match' as const, templateId: 'PADEL_BEST_OF_3' as const };
      const ctx2: TemplateFormatCoordinatorContext = {
        sport: Sports.PADEL,
        maxParticipants: 2,
        allowedScoringPresets: PADEL_CTX.allowedScoringPresets,
        participantContext: {
          maxParticipants: 2,
          playersPerMatch: 2,
          hasFixedTeams: false,
          genderTeams: 'ANY',
        },
      };
      const repick = evaluateParticipantRepick(ctx2, selection, {
        userChoseManual: false,
        explicitTemplatePick: false,
        bootstrapped: true,
        skipInitialAutoSelect: false,
        formatWizardOpen: false,
        initialParticipantContextKey: null,
      });
      expect(repick.type).toBe('repick');
      if (repick.type === 'repick') {
        expect(repick.selection.templateId).toBe('PADEL_SINGLES_AUTOMATIC');
      }
    });
  });

  describe('format match uses registry metadata not template id switches', () => {
    it('americano accepts any POINTS_ preset via inlineConfig', () => {
      const tpl = CREATE_TEMPLATES.PADEL_AMERICANO;
      const base = {
        scoringMode: 'POINTS' as const,
        matchTimerEnabled: false,
        customPointsTotal: null,
        winnerOfGame: 'BY_SCORES_DELTA' as const,
        generationType: 'AUTOMATIC' as const,
        deucesBeforeGoldenPoint: null,
        matchTimedCapMinutes: 15,
      };
      expect(formatMatchesCreateTemplate(tpl, { ...base, scoringPreset: 'POINTS_21' }, 4)).toBe(true);
      expect(formatMatchesCreateTemplate(tpl, { ...base, scoringPreset: 'POINTS_32' }, 4)).toBe(true);
    });

    it('timed template uses inlineConfig duration options', () => {
      const tpl = CREATE_TEMPLATES.PADEL_TIMED;
      const base = {
        scoringMode: 'CLASSIC' as const,
        scoringPreset: 'CLASSIC_TIMED' as const,
        generationType: 'AUTOMATIC' as const,
        matchTimerEnabled: true,
        customPointsTotal: null,
        winnerOfGame: 'BY_MATCHES_WON' as const,
        deucesBeforeGoldenPoint: null,
      };
      expect(formatMatchesCreateTemplate(tpl, { ...base, matchTimedCapMinutes: 10 }, 4)).toBe(true);
      expect(formatMatchesCreateTemplate(tpl, { ...base, matchTimedCapMinutes: 99 }, 4)).toBe(false);
    });
  });

  describe('snapshotsEqual', () => {
    it('detects preset drift between wizard open and close', () => {
      const a = gameFormatSnapshotFromFormat(
        mockFormat({ scoringPreset: 'CLASSIC_BEST_OF_3' }),
      );
      const b = gameFormatSnapshotFromFormat(
        mockFormat({ scoringPreset: 'CLASSIC_SINGLE_SET' }),
      );
      expect(snapshotsEqual(a, b)).toBe(false);
    });
  });
});
