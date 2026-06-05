import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import { CREATE_TEMPLATES } from '@/sport/createFlow';
import { estimateDurationLabelForTemplate } from '@/components/createGame/createTemplateDurationLabels';
import { formatEventDurationLabel, roundDisplayMinutes } from './formatEventDurationLabel';

describe('formatEventDurationLabel', () => {
  it('keeps 5-minute display steps above 90 minutes', () => {
    expect(roundDisplayMinutes(92)).toBe(90);
    expect(roundDisplayMinutes(98)).toBe(100);
    expect(formatEventDurationLabel(92)).not.toBe(formatEventDurationLabel(98));
  });
});

describe('americano point caps 11 vs 16', () => {
  const tpl = CREATE_TEMPLATES.PADEL_AMERICANO;

  it('shows different badges at 16 players when caps differ (level 6)', () => {
    const ctx = (preset: 'POINTS_11' | 'POINTS_16') => ({
      sport: Sports.PADEL,
      maxParticipants: 16,
      playersPerMatch: 4 as const,
      selectedCourtCount: 0,
      creatorLevel: 6,
      playerLevelRange: [2, 5] as [number, number],
      invitedLevels: [] as number[],
      selectedTemplateId: 'PADEL_AMERICANO' as const,
      liveScoringPreset: preset,
    });
    expect(estimateDurationLabelForTemplate(tpl, ctx('POINTS_11'))).not.toBe(
      estimateDurationLabelForTemplate(tpl, ctx('POINTS_16')),
    );
  });
});
