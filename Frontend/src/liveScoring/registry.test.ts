import { describe, expect, it } from 'vitest';
import { getRulesFromPreset } from '@/utils/scoring';
import { scoreLivePoint } from '@/utils/liveScoring';
import { computeServeGuideSnapshot, createInitialLiveScoringState } from '@/utils/liveScoring';
import {
  computeServeGuideSnapshotByPlugin,
  isRallyLiveScoringPlugin,
  liveScoringServeGuideEnabled,
  resolveLiveScoringPlugin,
  usesOpenEndedPointsUi,
} from './registry';
import { getRules } from '@/utils/scoring';

const classicRules = {
  ...getRulesFromPreset('CLASSIC_BEST_OF_3'),
  preset: 'CLASSIC_BEST_OF_3' as const,
  hasGoldenPoint: false,
  allowDrawPerSet: false,
  maxPointsPerTeam: 0,
  allowIncompleteRegularSetGames: false,
};

describe('live scoring registry', () => {
  it('routes tennis to tennis phase2 plugin', () => {
    const plugin = resolveLiveScoringPlugin('TENNIS', 'CLASSIC_BEST_OF_3');
    expect(plugin.engineId).toBe('tennis-phase2');
    expect(plugin.uiId).toBe('tennis-court');
    expect(plugin.serveGuideEnabled).toBe(true);
  });

  it('routes tennis CLASSIC_FAST4 to tennis phase2 plugin', () => {
    const plugin = resolveLiveScoringPlugin('TENNIS', 'CLASSIC_FAST4');
    expect(plugin.engineId).toBe('tennis-phase2');
    expect(plugin.uiId).toBe('tennis-court');
    const rules = getRulesFromPreset('CLASSIC_FAST4');
    expect(rules.gamesPerSet).toBe(4);
    expect(rules.tieBreakGameFirstTo).toBe(5);
  });

  it('keeps padel on default plugin', () => {
    const plugin = resolveLiveScoringPlugin('PADEL', 'CLASSIC_BEST_OF_3');
    expect(plugin.engineId).toBe('padel-default');
    expect(plugin.uiId).toBe('padel-court');
    expect(plugin.serveGuideEnabled).toBe(true);
  });

  it('falls back to padel plugin for unknown sport', () => {
    const plugin = resolveLiveScoringPlugin('UNKNOWN', 'CLASSIC_BEST_OF_3');
    expect(plugin.engineId).toBe('padel-default');
  });

  it('routes pickleball with opt-in serve guide', () => {
    const plugin = resolveLiveScoringPlugin('PICKLEBALL', 'POINTS_11');
    expect(plugin.engineId).toBe('rally-points');
    expect(plugin.uiId).toBe('pickleball-board');
    expect(plugin.serveGuideEnabled).toBe(true);
    expect(plugin.officiatingLevel).toBe('hints');
    expect(isRallyLiveScoringPlugin(plugin)).toBe(true);
    const rules = {
      ...getRulesFromPreset('POINTS_11'),
      preset: 'POINTS_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    expect(liveScoringServeGuideEnabled('PICKLEBALL', plugin, rules)).toBe(true);
  });

  it('turns off serve guide for padel americano points', () => {
    const plugin = resolveLiveScoringPlugin('PADEL', 'POINTS_24');
    const rules = {
      ...getRulesFromPreset('POINTS_24'),
      preset: 'POINTS_24' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: true,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    expect(liveScoringServeGuideEnabled('PADEL', plugin, rules)).toBe(false);
  });

  it('squash serve guide: winner serves, box alternates with server score', () => {
    const plugin = resolveLiveScoringPlugin('SQUASH', 'BEST_OF_5_11');
    expect(plugin.uiId).toBe('squash-board');
    expect(plugin.serveGuideEnabled).toBe(true);
    const rules = {
      ...getRulesFromPreset('BEST_OF_5_11'),
      preset: 'BEST_OF_5_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const state = {
      ...createInitialLiveScoringState(rules),
      firstServerTeam: 'teamA' as const,
      pointsServeRotation: 'official' as const,
    };
    const snap0 = computeServeGuideSnapshotByPlugin(plugin, state, rules, ['A1'], ['B1'], 2);
    const afterTwo = scoreLivePoint(scoreLivePoint(state, 'teamA', rules).state, 'teamA', rules).state;
    const snap2 = computeServeGuideSnapshotByPlugin(plugin, afterTwo, rules, ['A1'], ['B1'], 2);
    expect(snap0?.serverTeam).toBe('teamA');
    expect(snap0?.courtSide).toBe('rightDeuce');
    expect(snap2?.serverTeam).toBe('teamA');
    expect(snap2?.courtSide).toBe('rightDeuce');
    expect(snap2?.motionToken.startsWith('sq-')).toBe(true);
    const atElevenNine = {
      ...state,
      sets: [{ teamA: 11, teamB: 9, isTieBreak: false }],
    };
    const endsSnap = computeServeGuideSnapshotByPlugin(plugin, atElevenNine, rules, ['A1'], ['B1'], 2);
    expect(endsSnap?.changeEndsBeforeNextPoint).toBe(true);
    const atElevenTen = {
      ...state,
      sets: [{ teamA: 11, teamB: 10, isTieBreak: false }],
    };
    const noEndsSnap = computeServeGuideSnapshotByPlugin(plugin, atElevenTen, rules, ['A1'], ['B1'], 2);
    expect(noEndsSnap?.changeEndsBeforeNextPoint).toBe(false);
  });

  it('routes badminton with opt-in serve guide and service court hints', () => {
    const plugin = resolveLiveScoringPlugin('BADMINTON', 'BEST_OF_3_21');
    expect(plugin.uiId).toBe('badminton-board');
    expect(plugin.serveGuideEnabled).toBe(true);
    const rules = {
      ...getRulesFromPreset('BEST_OF_3_21'),
      preset: 'BEST_OF_3_21' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const state = {
      ...createInitialLiveScoringState(rules),
      firstServerTeam: 'teamA' as const,
      pointsServeRotation: 'official' as const,
    };
    const snap = computeServeGuideSnapshotByPlugin(plugin, state, rules, ['A1'], ['B1'], 2);
    expect(snap?.serverTeam).toBe('teamA');
    expect(snap?.courtSide).toBe('rightDeuce');
    expect(snap?.motionToken.startsWith('bd-')).toBe(true);
    const atInterval = {
      ...state,
      sets: [{ teamA: 11, teamB: 9, isTieBreak: false }],
    };
    const intervalSnap = computeServeGuideSnapshotByPlugin(plugin, atInterval, rules, ['A1'], ['B1'], 2);
    expect(intervalSnap?.changeEndsBeforeNextPoint).toBe(true);
    expect(intervalSnap?.courtSide).toBe('leftAd');
  });

  it('routes table tennis with serve guide and 2-point rotation', () => {
    const plugin = resolveLiveScoringPlugin('TABLE_TENNIS', 'POINTS_11');
    expect(plugin.uiId).toBe('table-tennis-board');
    expect(plugin.serveGuideEnabled).toBe(true);
    const pointsRules = {
      ...getRulesFromPreset('POINTS_11'),
      preset: 'POINTS_11' as const,
      allowDrawPerSet: false,
      hasGoldenPoint: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      firstServerTeam: 'teamA' as const,
      pointsServeRotation: 'official' as const,
    };
    const snap0 = computeServeGuideSnapshotByPlugin(plugin, state, pointsRules, ['A1'], ['B1'], 2);
    const afterTwo = scoreLivePoint(scoreLivePoint(state, 'teamA', pointsRules).state, 'teamA', pointsRules).state;
    const snap2 = computeServeGuideSnapshotByPlugin(plugin, afterTwo, pointsRules, ['A1'], ['B1'], 2);
    expect(snap0?.serverTeam).toBe('teamA');
    expect(snap2?.serverTeam).toBe('teamB');
    expect(snap2?.motionToken.startsWith('tt-')).toBe(true);
  });

  it('scores table tennis best-of-5 games to 11 with win-by-2', () => {
    const rules = {
      ...getRulesFromPreset('BEST_OF_5_11'),
      preset: 'BEST_OF_5_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    let state = createInitialLiveScoringState(rules);
    for (let i = 0; i < 11; i += 1) {
      state = scoreLivePoint(state, 'teamA', rules).state;
    }
    expect(state.sets[0]?.teamA).toBe(11);
    expect(state.sets[0]?.teamB).toBe(0);
    expect(state.activeSetIndex).toBe(1);
  });

  it('pickleball serve guide uses service court, rally server, and side switch at 6 in decider', () => {
    const plugin = resolveLiveScoringPlugin('PICKLEBALL', 'POINTS_11');
    const pointsRules = {
      ...getRulesFromPreset('POINTS_11'),
      preset: 'POINTS_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      pointsServeRotation: 'official' as const,
    };
    const snap = computeServeGuideSnapshotByPlugin(plugin, state, pointsRules, ['A1', 'A2'], ['B1', 'B2'], 4);
    expect(snap?.serverTeam).toBe('teamA');
    expect(snap?.courtSide).toBe('rightDeuce');
    expect(snap?.tieBreakServeSlot).toBeNull();
    expect(snap?.motionToken.startsWith('pb-')).toBe(true);
    const afterSideOut = scoreLivePoint(state, 'teamB', pointsRules).state;
    const snapOdd = computeServeGuideSnapshotByPlugin(plugin, afterSideOut, pointsRules, ['A1', 'A2'], ['B1', 'B2'], 4);
    expect(snapOdd?.serverTeam).toBe('teamB');
    expect(snapOdd?.courtSide).toBe('leftAd');
    const afterHold = scoreLivePoint(scoreLivePoint(state, 'teamA', pointsRules).state, 'teamA', pointsRules).state;
    const snapHold = computeServeGuideSnapshotByPlugin(plugin, afterHold, pointsRules, ['A1', 'A2'], ['B1', 'B2'], 4);
    expect(snapHold?.serverTeam).toBe('teamA');
    const atSixFour = {
      ...state,
      sets: [{ teamA: 6, teamB: 4, isTieBreak: false }],
    };
    const endsSnap = computeServeGuideSnapshotByPlugin(plugin, atSixFour, pointsRules, ['A1', 'A2'], ['B1', 'B2'], 4);
    expect(endsSnap?.changeEndsBeforeNextPoint).toBe(true);
    const bo3Rules = {
      ...getRulesFromPreset('BEST_OF_3_11'),
      preset: 'BEST_OF_3_11' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const game1SixFour = {
      ...createInitialLiveScoringState(bo3Rules),
      firstServerTeam: 'teamA' as const,
      sets: [{ teamA: 6, teamB: 4, isTieBreak: false }],
    };
    const noMidGame1 = computeServeGuideSnapshotByPlugin(plugin, game1SixFour, bo3Rules, ['A1'], ['B1'], 2);
    expect(noMidGame1?.changeEndsBeforeNextPoint).toBe(false);
  });

  it('uses playersPerMatch=4 for doubles serve guide when roster has one name per team', () => {
    const plugin = resolveLiveScoringPlugin('PADEL', 'POINTS_32');
    const pointsRules = {
      ...getRulesFromPreset('POINTS_32'),
      preset: 'POINTS_32' as const,
      hasGoldenPoint: false,
      allowDrawPerSet: true,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const state = {
      ...createInitialLiveScoringState(pointsRules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      pointsServeRotation: 'simple' as const,
    };
    const snap = computeServeGuideSnapshot(state, pointsRules, ['A1'], ['B1'], true);
    expect(snap?.serverTeam).toBe('teamA');
    expect(snap?.serverPlayerIndex).toBe(0);
    const viaPlugin = computeServeGuideSnapshotByPlugin(plugin, state, pointsRules, ['A1'], ['B1'], 4);
    expect(viaPlugin?.serverPlayerIndex).toBe(0);
  });

  it('routes open-ended TIMED/CUSTOM for all rally sports to americano UI', () => {
    for (const sport of ['PICKLEBALL', 'BADMINTON', 'TABLE_TENNIS', 'SQUASH'] as const) {
      const timed = resolveLiveScoringPlugin(sport, 'TIMED');
      expect(timed.uiId).toBe('americano-points');
      expect(isRallyLiveScoringPlugin(timed)).toBe(false);
      const custom = resolveLiveScoringPlugin(sport, 'CUSTOM');
      expect(custom.uiId).toBe('americano-points');
      expect(custom.serveGuideEnabled).toBe(false);
    }
    expect(usesOpenEndedPointsUi('TIMED')).toBe(true);
    const customRules = getRules({ sport: 'PICKLEBALL', scoringPreset: 'CUSTOM' } as never);
    expect(usesOpenEndedPointsUi('CUSTOM', customRules)).toBe(true);
  });

  it('keeps padel/tennis TIMED on court plugins', () => {
    expect(resolveLiveScoringPlugin('PADEL', 'TIMED').uiId).toBe('padel-court');
    expect(resolveLiveScoringPlugin('TENNIS', 'TIMED').uiId).toBe('tennis-court');
    expect(resolveLiveScoringPlugin('PADEL', 'CLASSIC_TIMED').uiId).toBe('padel-court');
  });

  it('keeps tennis tie-break serve slot in phase2', () => {
    const plugin = resolveLiveScoringPlugin('TENNIS', 'CLASSIC_BEST_OF_3');
    const state = {
      ...createInitialLiveScoringState(classicRules),
      sets: [{ teamA: 6, teamB: 6, isTieBreak: false }],
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 0,
      classic: {
        pointState: { kind: 'regular' as const, teamA: 0 as const, teamB: 0 as const },
        withinSetTieBreak: true,
        tieBreakA: 1,
        tieBreakB: 0,
        classicPointsPlayedInGame: 0,
      },
    };

    const snapshot = computeServeGuideSnapshotByPlugin(plugin, state, classicRules, ['A1', 'A2'], ['B1', 'B2'], 4);
    expect(snapshot?.tieBreakServeSlot).toBe('serveOne');
    expect(snapshot?.motionToken.startsWith('tennis-')).toBe(true);
  });
});
