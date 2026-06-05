import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { CREATE_TEMPLATES, getCreateFlowConfig } from '@/sport/createFlow';
import {
  estimateDurationLabelForCustomFormat,
  estimateDurationLabelForTemplate,
  type CreateTemplateDurationContext,
} from '@/components/createGame/createTemplateDurationLabels';
import { defaultBaselineRounds } from './estimateEventDuration';

const LABEL_RE = /^~(\d+m|\d+h( \d+m)?)$/;

function baseCtx(
  sport: (typeof Sports)[keyof typeof Sports],
  maxParticipants: number,
  playersPerMatch: 2 | 4,
  selectedCourtCount: number,
  creatorLevel: number,
): CreateTemplateDurationContext {
  return {
    sport,
    maxParticipants,
    playersPerMatch,
    selectedCourtCount,
    creatorLevel,
    playerLevelRange: [2, 5],
    invitedLevels: [],
    selectedTemplateId: null,
  };
}

function labelToMinutes(label: string): number {
  const h = label.match(/^~(\d+)h(?: (\d+)m)?$/);
  if (h) return parseInt(h[1]!, 10) * 60 + (h[2] ? parseInt(h[2], 10) : 0);
  const m = label.match(/^~(\d+)m$/);
  return m ? parseInt(m[1]!, 10) : 0;
}

function collectUiTemplateIds(): string[] {
  const ids = new Set<string>();
  for (const sport of Object.values(Sports)) {
    for (const id of getCreateFlowConfig(sport).createTemplates) {
      ids.add(id);
    }
  }
  return [...ids];
}

describe('create template duration verification', () => {
  it('every UI template yields a valid ~label', () => {
    for (const id of collectUiTemplateIds()) {
      const tpl = CREATE_TEMPLATES[id as keyof typeof CREATE_TEMPLATES];
      expect(tpl, id).toBeDefined();
      const label = estimateDurationLabelForTemplate(
        tpl,
        baseCtx(tpl.sport, tpl.suggestedMaxParticipants, tpl.playersPerMatch, 0, 3),
      );
      expect(label, id).toMatch(LABEL_RE);
      expect(labelToMinutes(label), id).toBeGreaterThan(0);
    }
  });

  it('padel Americano: elite play time >> novice (≥2.5×)', () => {
    const tpl = CREATE_TEMPLATES.PADEL_AMERICANO;
    const novice = labelToMinutes(
      estimateDurationLabelForTemplate(tpl, baseCtx(Sports.PADEL, 16, 4, 0, 1)),
    );
    const elite = labelToMinutes(
      estimateDurationLabelForTemplate(tpl, baseCtx(Sports.PADEL, 16, 4, 0, 6.5)),
    );
    expect(elite).toBeGreaterThanOrEqual(novice * 2.5);
  });

  it('4p padel best-of-3 shorter than 16p Americano at same level', () => {
    const bo3 = labelToMinutes(
      estimateDurationLabelForTemplate(
        CREATE_TEMPLATES.PADEL_BEST_OF_3,
        baseCtx(Sports.PADEL, 4, 4, 0, 3),
      ),
    );
    const am = labelToMinutes(
      estimateDurationLabelForTemplate(
        CREATE_TEMPLATES.PADEL_AMERICANO,
        baseCtx(Sports.PADEL, 16, 4, 0, 3),
      ),
    );
    expect(bo3).toBeLessThan(am);
  });

  it('fewer participants lowers Americano estimate (same court setup)', () => {
    const tpl = CREATE_TEMPLATES.PADEL_AMERICANO;
    const full = labelToMinutes(
      estimateDurationLabelForTemplate(tpl, baseCtx(Sports.PADEL, 16, 4, 4, 3)),
    );
    const half = labelToMinutes(
      estimateDurationLabelForTemplate(tpl, baseCtx(Sports.PADEL, 8, 4, 4, 3)),
    );
    expect(half).toBeLessThan(full);
  });

  it('custom format returns valid label', () => {
    const label = estimateDurationLabelForCustomFormat({
      ...baseCtx(Sports.PADEL, 12, 4, 3, 3),
      scoringPreset: 'POINTS_24',
      matchGenerationType: 'RANDOM',
      gameType: 'AMERICANO',
      matchTimerEnabled: false,
      matchTimedCapMinutes: 0,
    });
    expect(label).toMatch(LABEL_RE);
  });

  it('all CREATE_TEMPLATES have baselineRounds or AUTOMATIC default', () => {
    for (const tpl of Object.values(CREATE_TEMPLATES)) {
      const rounds =
        tpl.baselineRounds ?? defaultBaselineRounds(tpl.matchGenerationType, tpl.gameType);
      expect(rounds).toBeGreaterThanOrEqual(1);
    }
  });
});
