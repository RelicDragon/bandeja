import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { getOfficiatingLevelForGame } from '@/sport/createFlow';
import {
  liveScoringOfficiatingHintsEnabled,
  liveScoringServeGuideEnabled,
  resolveLiveScoringPlugin,
} from './registry';
import { Sports } from '@shared/sport';

describe('officiating level', () => {
  it('defaults pickleball social points to hints', () => {
    expect(getOfficiatingLevelForGame(Sports.PICKLEBALL, 'POINTS_21')).toBe('hints');
  });

  it('defaults padel match classic to strict', () => {
    expect(getOfficiatingLevelForGame(Sports.PADEL, 'CLASSIC_BEST_OF_3')).toBe('strict');
  });

  it('defaults pickleball match best-of to strict', () => {
    expect(getOfficiatingLevelForGame(Sports.PICKLEBALL, 'BEST_OF_3_11')).toBe('strict');
  });

  it('defaults padel social points to none', () => {
    expect(getOfficiatingLevelForGame(Sports.PADEL, 'POINTS_24')).toBe('none');
  });

  it('honors game.metadata override', () => {
    expect(
      getOfficiatingLevelForGame(Sports.PICKLEBALL, 'POINTS_21', { officiatingLevel: 'none' }),
    ).toBe('none');
  });

  it('gates pickleball honor UI on hints only', () => {
    const hints = resolveLiveScoringPlugin(Sports.PICKLEBALL, 'POINTS_21');
    expect(liveScoringOfficiatingHintsEnabled(hints)).toBe(true);
    const none = resolveLiveScoringPlugin(Sports.PICKLEBALL, 'POINTS_21', { officiatingLevel: 'none' });
    expect(liveScoringOfficiatingHintsEnabled(none)).toBe(false);
  });

  it('disables serve guide for ball-budget POINTS_*', () => {
    const plugin = resolveLiveScoringPlugin(Sports.PADEL, 'POINTS_24');
    const rules = {
      ...getRulesFromPreset('POINTS_24'),
      preset: 'POINTS_24' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: true,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    expect(liveScoringServeGuideEnabled(Sports.PADEL, plugin, rules)).toBe(false);
  });

  it('keeps serve guide for pickleball best-of', () => {
    const plugin = resolveLiveScoringPlugin(Sports.PICKLEBALL, 'BEST_OF_3_11');
    const rules = {
      ...getRulesFromPreset('BEST_OF_3_11'),
      preset: 'BEST_OF_3_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    expect(liveScoringServeGuideEnabled(Sports.PICKLEBALL, plugin, rules)).toBe(true);
  });
});
