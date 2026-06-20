import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { createInitialLiveScoringState, scoreLivePoint } from '@/utils/liveScoring';
import { rallyScoreMetaForState } from './rallyScoreMeta';

describe('rallyScoreMetaForState', () => {
  it('labels single game to 21', () => {
    const rules = {
      ...getRulesFromPreset('POINTS_21'),
      preset: 'POINTS_21' as const,
      deucesBeforeGoldenPoint: null,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const state = createInitialLiveScoringState(rules);
    expect(rallyScoreMetaForState(state, rules)).toEqual({ gameCap: 21 });
  });

  it('shows set chips and games won for best-of-3 to 21', () => {
    const rules = {
      ...getRulesFromPreset('BEST_OF_3_21'),
      preset: 'BEST_OF_3_21' as const,
      deucesBeforeGoldenPoint: null,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    let state = createInitialLiveScoringState(rules);
    for (let i = 0; i < 21; i += 1) {
      state = scoreLivePoint(state, 'teamA', rules).state;
    }
    const meta = rallyScoreMetaForState(state, rules);
    expect(meta.gameCap).toBe(21);
    expect(meta.setChips?.length).toBe(state.sets.length);
    expect(meta.setsWon).toEqual({ teamA: 1, teamB: 0 });
    expect(meta.setChips?.[state.activeSetIndex]?.isActive).toBe(true);
  });
});
