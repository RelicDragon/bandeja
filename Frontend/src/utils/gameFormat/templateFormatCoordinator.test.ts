import { describe, expect, it, vi } from 'vitest';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import { Sports } from '@shared/sport';
import {
  beginWizardSession,
  buildCreateBootstrap,
  evaluateParticipantRepick,
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
  allowedScoringPresets: [
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
    hasGoldenPoint: false,
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
      const atOpen = mockFormat({ scoringPreset: 'CLASSIC_BEST_OF_3', generationType: 'AUTOMATIC' });
      const session = beginWizardSession(selection, atOpen);
      const afterWizard = mockFormat({
        scoringPreset: 'CLASSIC_SINGLE_SET',
        generationType: 'AUTOMATIC',
      });
      const result = evaluateWizardClose(PADEL_CTX, afterWizard, selection, session, {
        userChoseManual: false,
      });
      expect(result.type).toBe('demote');
    });

    it('restores template match when wizard edits are reverted', () => {
      const selection = { intent: 'match' as const, templateId: 'PADEL_BEST_OF_3' as const };
      const atOpen = mockFormat({ scoringPreset: 'CLASSIC_BEST_OF_3', generationType: 'AUTOMATIC' });
      const session = beginWizardSession(selection, atOpen);
      const reverted = mockFormat({ scoringPreset: 'CLASSIC_BEST_OF_3', generationType: 'AUTOMATIC' });
      const result = evaluateWizardClose(PADEL_CTX, reverted, selection, session, {
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

  describe('format match uses registry metadata not template id switches', () => {
    it('americano accepts any POINTS_ preset via inlineConfig', () => {
      const tpl = CREATE_TEMPLATES.PADEL_AMERICANO;
      const base = {
        scoringMode: 'POINTS' as const,
        matchTimerEnabled: false,
        customPointsTotal: null,
        winnerOfGame: 'BY_SCORES_DELTA' as const,
        generationType: 'AUTOMATIC' as const,
        hasGoldenPoint: false,
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
        hasGoldenPoint: false,
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
