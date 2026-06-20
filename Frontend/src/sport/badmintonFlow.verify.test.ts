import { describe, expect, it } from 'vitest';
import { Sports } from '@shared/sport';
import {
  CREATE_FLOW_BY_SPORT,
  CREATE_TEMPLATES,
  getOfficiatingLevelForGame,
  getStrictValidationForPreset,
} from '@/sport/createFlow';
import { CREATE_TEMPLATES as SHARED_CREATE_TEMPLATES } from '@shared/createTemplates';
import { getSportConfig } from '@/sport/sportRegistry';
import { getRulesFromPreset } from '@/utils/scoring';
import {
  computeServeGuideSnapshotByPlugin,
  liveScoringServeGuideEnabled,
  resolveLiveScoringPlugin,
} from '@/liveScoring/registry';
import { createInitialLiveScoringState, scoreLivePoint } from '@/utils/liveScoring';
import {
  badmintonChangeEndsBeforeNextPoint,
  badmintonCourtEndsSwapped,
  badmintonNextServerTeam,
} from '@/utils/liveScoring/badmintonServe';

const BADMINTON_TEMPLATE_IDS = [
  'BADMINTON_AMERICANO_21',
  'BADMINTON_CLUB_3X21',
  'BADMINTON_CLUB_3X15',
  'BADMINTON_MATCH_3X21',
] as const;

const CORE_FIELDS = [
  'scoringPreset',
  'gameType',
  'matchGenerationType',
  'playersPerMatch',
  'suggestedMaxParticipants',
  'suggestedCourts',
  'affectsRating',
  'matchTimerEnabled',
  'matchTimedCapMinutes',
] as const;

describe('badminton create flow', () => {
  it('lists three templates wired in FE and BE registry', () => {
    const flow = CREATE_FLOW_BY_SPORT[Sports.BADMINTON];
    expect(flow.createTemplates).toEqual([...BADMINTON_TEMPLATE_IDS]);
    expect(getSportConfig(Sports.BADMINTON).createTemplates).toEqual([...BADMINTON_TEMPLATE_IDS]);
  });

  it.each(BADMINTON_TEMPLATE_IDS)('FE template %s matches shared registry', (id) => {
    const fe = CREATE_TEMPLATES[id];
    const shared = SHARED_CREATE_TEMPLATES[id];
    for (const key of CORE_FIELDS) {
      const feVal = fe[key as keyof typeof fe];
      const sharedVal = shared[key as keyof typeof shared];
      if (sharedVal === undefined && feVal === undefined) continue;
      expect(feVal).toBe(sharedVal);
    }
  });

  it('exposes customize presets including POINTS_15 and BWF strict caps', () => {
    const presets = CREATE_FLOW_BY_SPORT[Sports.BADMINTON].presetMeta.map((m) => m.preset);
    expect(presets).toContain('POINTS_21');
    expect(presets).toContain('POINTS_15');
    expect(presets).toContain('BEST_OF_3_21');
    expect(presets).toContain('BEST_OF_3_15');
    expect(presets).toContain('CUSTOM');
    expect(getStrictValidationForPreset(Sports.BADMINTON, 'BEST_OF_3_21')).toBe('BWF_21');
    expect(getStrictValidationForPreset(Sports.BADMINTON, 'BEST_OF_3_15')).toBe('BWF_15');
    expect(getStrictValidationForPreset(Sports.BADMINTON, 'POINTS_21')).toBe('NONE');
    expect(getOfficiatingLevelForGame(Sports.BADMINTON, 'BEST_OF_3_21')).toBe('strict');
  });

  it('allows POINTS_15 in sport scoring list', () => {
    expect(getSportConfig(Sports.BADMINTON).allowedScoringPresets).toContain('POINTS_15');
  });
});

describe('badminton live scoring + serve guide', () => {
  const bo3Rules = {
    ...getRulesFromPreset('BEST_OF_3_21'),
    preset: 'BEST_OF_3_21' as const,
    deucesBeforeGoldenPoint: null,
    allowDrawPerSet: false,
    maxPointsPerTeam: 0,
    allowIncompleteRegularSetGames: false,
  };

  it('winner of rally serves next (not 2-point TT rotation)', () => {
    let state = {
      ...createInitialLiveScoringState(bo3Rules),
      firstServerTeam: 'teamA' as const,
      pointsServeRotation: 'official' as const,
    };
    const plugin = resolveLiveScoringPlugin('BADMINTON', 'BEST_OF_3_21');
    for (let i = 0; i < 3; i += 1) {
      const snap = computeServeGuideSnapshotByPlugin(plugin, state, bo3Rules, ['A1'], ['B1'], 2);
      expect(snap?.serverTeam).toBe('teamA');
      state = scoreLivePoint(state, 'teamA', bo3Rules).state;
    }
    const afterHold = computeServeGuideSnapshotByPlugin(plugin, state, bo3Rules, ['A1'], ['B1'], 2);
    expect(afterHold?.serverTeam).toBe('teamA');
    expect(badmintonNextServerTeam(state, 'teamA')).toBe('teamA');
  });

  it('switches server to rally winner after side-out', () => {
    let state = {
      ...createInitialLiveScoringState(bo3Rules),
      firstServerTeam: 'teamA' as const,
      pointsServeRotation: 'official' as const,
    };
    state = scoreLivePoint(state, 'teamB', bo3Rules).state;
    expect(badmintonNextServerTeam(state, 'teamA')).toBe('teamB');
  });

  it('doubles serve guide tracks partner rotation within team', () => {
    const plugin = resolveLiveScoringPlugin('BADMINTON', 'BEST_OF_3_21');
    let state = {
      ...createInitialLiveScoringState(bo3Rules),
      firstServerTeam: 'teamA' as const,
      firstServerDoublesPlayerIndex: 1,
      pointsServeRotation: 'official' as const,
    };
    const namesA = ['A0', 'A1'];
    const namesB = ['B0', 'B1'];
    let snap = computeServeGuideSnapshotByPlugin(plugin, state, bo3Rules, namesA, namesB, 4);
    expect(snap?.serverPlayerIndex).toBe(1);
    expect(snap?.serverDisplayName).toBe('A1');

    state = scoreLivePoint(state, 'teamA', bo3Rules).state;
    snap = computeServeGuideSnapshotByPlugin(plugin, state, bo3Rules, namesA, namesB, 4);
    expect(snap?.serverPlayerIndex).toBe(1);

    state = scoreLivePoint(state, 'teamA', bo3Rules).state;
    state = scoreLivePoint(state, 'teamB', bo3Rules).state;
    snap = computeServeGuideSnapshotByPlugin(plugin, state, bo3Rules, namesA, namesB, 4);
    expect(snap?.serverPlayerIndex).toBe(1);
    expect(snap?.serverDisplayName).toBe('B1');

    state = scoreLivePoint(state, 'teamA', bo3Rules).state;
    snap = computeServeGuideSnapshotByPlugin(plugin, state, bo3Rules, namesA, namesB, 4);
    expect(snap?.serverPlayerIndex).toBe(0);
    expect(snap?.serverDisplayName).toBe('A0');
  });

  it('enables serve guide for match presets only', () => {
    const matchPlugin = resolveLiveScoringPlugin('BADMINTON', 'BEST_OF_3_21');
    expect(liveScoringServeGuideEnabled('BADMINTON', matchPlugin, bo3Rules)).toBe(true);
    const socialRules = {
      ...getRulesFromPreset('POINTS_21'),
      preset: 'POINTS_21' as const,
      deucesBeforeGoldenPoint: null,
      allowDrawPerSet: false,
      maxPointsPerTeam: 0,
      allowIncompleteRegularSetGames: false,
    };
    const socialPlugin = resolveLiveScoringPlugin('BADMINTON', 'POINTS_21');
    expect(liveScoringServeGuideEnabled('BADMINTON', socialPlugin, socialRules)).toBe(false);
    expect(socialPlugin.uiId).toBe('badminton-board');
  });

  it('auto-advances game at 21 with win-by-2 and completes Bo3', () => {
    let state = createInitialLiveScoringState(bo3Rules);
    for (let i = 0; i < 21; i += 1) state = scoreLivePoint(state, 'teamA', bo3Rules).state;
    expect(state.sets[0]).toMatchObject({ teamA: 21, teamB: 0 });
    expect(state.activeSetIndex).toBe(1);
    for (let i = 0; i < 21; i += 1) state = scoreLivePoint(state, 'teamB', bo3Rules).state;
    expect(state.activeSetIndex).toBe(2);
    for (let i = 0; i < 21; i += 1) state = scoreLivePoint(state, 'teamA', bo3Rules).state;
    expect(state.activeSetIndex).toBe(2);
    expect(state.sets[2]).toMatchObject({ teamA: 21, teamB: 0 });
  });

  it('blocks 21-20 without win-by-2', () => {
    let state = createInitialLiveScoringState(bo3Rules);
    for (let i = 0; i < 20; i += 1) state = scoreLivePoint(state, 'teamA', bo3Rules).state;
    for (let i = 0; i < 20; i += 1) state = scoreLivePoint(state, 'teamB', bo3Rules).state;
    const blocked = scoreLivePoint(state, 'teamA', bo3Rules);
    expect(blocked.changed).toBe(true);
    expect(blocked.state.sets[0]).toMatchObject({ teamA: 21, teamB: 20 });
    expect(blocked.state.activeSetIndex).toBe(0);
  });

  it('signals interval at 11-9 and flips court ends after interval', () => {
    expect(badmintonChangeEndsBeforeNextPoint(11, 9, 21)).toBe(true);
    expect(badmintonChangeEndsBeforeNextPoint(11, 10, 21)).toBe(false);
    expect(
      badmintonCourtEndsSwapped(
        { activeSetIndex: 0, matchStartCourtEndsSwapped: false } as never,
        11,
        9,
        21,
      ),
    ).toBe(true);
    expect(
      badmintonCourtEndsSwapped(
        { activeSetIndex: 1, matchStartCourtEndsSwapped: false } as never,
        0,
        0,
        21,
      ),
    ).toBe(true);
  });
});
