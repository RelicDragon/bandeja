import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { createInitialLiveScoringState } from './core';
import { computeServeGuideSnapshot, needsServeSetup } from './serveGuide';

const pointsRules = {
  ...getRulesFromPreset('POINTS_16'),
  preset: 'POINTS_16' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: true,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

describe('serveGuide points mode', () => {
  it('prompts first server on pristine Americano start', () => {
    const state = createInitialLiveScoringState(pointsRules);
    expect(state.mode).toBe('points');
    expect(needsServeSetup(state, pointsRules)).toBe(true);
  });

  it('shows court strip after first server is chosen', () => {
    const base = createInitialLiveScoringState(pointsRules);
    const state = {
      ...base,
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
    };
    expect(needsServeSetup(state, pointsRules)).toBe(false);
    const snap = computeServeGuideSnapshot(state, pointsRules, ['Alice', 'Bob'], ['Carol', 'Dan']);
    expect(snap?.serverTeam).toBe('teamA');
    expect(snap?.courtSide).toBe('rightDeuce');
  });
});
