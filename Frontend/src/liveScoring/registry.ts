import type { ScoringPreset } from '@/types';
import { Sports, isSport, type Sport } from '@shared/sport';
import { parseGameSport } from '@/utils/gameSport';
import type { ScoringRules } from '@/utils/scoring';
import {
  computeServeGuideSnapshot,
  needsServeSetup,
  type LiveScoringState,
  type ServeGuideSnapshot,
} from '@/utils/liveScoring';
import {
  badmintonChangeEndsBeforeNextPoint,
  badmintonCourtSideForServerScore,
} from '@/utils/liveScoring/badmintonServe';
import { squashChangeEndsBeforeNextPoint } from '@/utils/liveScoring/squashServe';
import {
  pickleballChangeEndsBeforeNextPoint,
  pickleballCourtSideForServerScore,
  pickleballDoublesServeSlot,
  pickleballServeMotionToken,
} from '@/utils/liveScoring/pickleballServe';
import { isDoublesMatch } from '@/utils/matchFormat';
import { getSportConfig } from '@/sport/sportRegistry';

export type LiveScoringEngineId = 'padel-default' | 'tennis-phase2' | 'rally-points';

export type LiveScoringUiId =
  | 'padel-court'
  | 'tennis-court'
  | 'table-tennis-board'
  | 'badminton-board'
  | 'pickleball-board'
  | 'squash-board';

export type LiveScoringPlugin = {
  engineId: LiveScoringEngineId;
  uiId: LiveScoringUiId;
  serveGuideEnabled: boolean;
};

const TENNIS_PRESETS: ReadonlySet<ScoringPreset | 'DERIVED'> = new Set([
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_SUPER_TIEBREAK',
  'CLASSIC_SINGLE_SET',
  'CLASSIC_TIMED',
  'TIMED',
  'CUSTOM',
  'DERIVED',
]);

type RallySport =
  | typeof Sports.TABLE_TENNIS
  | typeof Sports.BADMINTON
  | typeof Sports.PICKLEBALL
  | typeof Sports.SQUASH;

const RALLY_SPORTS: ReadonlySet<Sport> = new Set([
  Sports.TABLE_TENNIS,
  Sports.BADMINTON,
  Sports.PICKLEBALL,
  Sports.SQUASH,
]);

const PADEL_PLUGIN: LiveScoringPlugin = {
  engineId: 'padel-default',
  uiId: 'padel-court',
  serveGuideEnabled: true,
};

const TENNIS_PHASE2_PLUGIN: LiveScoringPlugin = {
  engineId: 'tennis-phase2',
  uiId: 'tennis-court',
  serveGuideEnabled: true,
};

const RALLY_UI_BY_SPORT: Record<RallySport, LiveScoringUiId> = {
  [Sports.TABLE_TENNIS]: 'table-tennis-board',
  [Sports.BADMINTON]: 'badminton-board',
  [Sports.PICKLEBALL]: 'pickleball-board',
  [Sports.SQUASH]: 'squash-board',
};

function rallyPlugin(sport: RallySport): LiveScoringPlugin {
  return {
    engineId: 'rally-points',
    uiId: RALLY_UI_BY_SPORT[sport],
    serveGuideEnabled:
      sport === Sports.TABLE_TENNIS ||
      sport === Sports.BADMINTON ||
      sport === Sports.SQUASH ||
      sport === Sports.PICKLEBALL,
  };
}

function isRallySport(sport: unknown): sport is RallySport {
  return isSport(sport) && RALLY_SPORTS.has(sport);
}

export function isRallyLiveScoringPlugin(plugin: LiveScoringPlugin): boolean {
  return plugin.engineId === 'rally-points';
}

export function liveScoringServeGuideEnabled(
  sport: unknown,
  plugin: LiveScoringPlugin,
): boolean {
  if (!plugin.serveGuideEnabled) return false;
  const s = parseGameSport(sport);
  if (
    s === Sports.TABLE_TENNIS ||
    s === Sports.BADMINTON ||
    s === Sports.SQUASH ||
    s === Sports.PICKLEBALL
  ) {
    return true;
  }
  const mode = getSportConfig(s).liveScoring;
  return mode === 'padel_doubles' || mode === 'tennis';
}

export function resolveLiveScoringPlugin(
  sport: unknown,
  preset: ScoringPreset | 'DERIVED',
): LiveScoringPlugin {
  const s = parseGameSport(sport);
  if (s === Sports.TENNIS && TENNIS_PRESETS.has(preset)) return TENNIS_PHASE2_PLUGIN;
  if (isRallySport(s)) return rallyPlugin(s);
  return PADEL_PLUGIN;
}

export function needsServeSetupForPlugin(
  plugin: LiveScoringPlugin,
  state: LiveScoringState,
  rules: ScoringRules,
): boolean {
  void plugin;
  return needsServeSetup(state, rules);
}

export function computeServeGuideSnapshotByPlugin(
  plugin: LiveScoringPlugin,
  state: LiveScoringState,
  rules: ScoringRules,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[],
  playersPerMatch: number,
): ServeGuideSnapshot | null {
  if (!plugin.serveGuideEnabled) return null;
  const matchDoubles = isDoublesMatch(playersPerMatch);
  const snapshot = computeServeGuideSnapshot(
    state,
    rules,
    teamAPlayerNames,
    teamBPlayerNames,
    matchDoubles,
  );
  if (!snapshot) return null;

  if (plugin.engineId === 'tennis-phase2') {
    return { ...snapshot, motionToken: `tennis-${snapshot.motionToken}` };
  }
  if (plugin.uiId === 'table-tennis-board') {
    const set = state.sets[state.activeSetIndex];
    const t = (set?.teamA ?? 0) + (set?.teamB ?? 0);
    return {
      ...snapshot,
      tieBreakServeSlot: null,
      changeEndsBeforeNextPoint: t > 0 && t % 5 === 0,
      motionToken: `tt-${snapshot.motionToken}`,
    };
  }
  if (plugin.uiId === 'badminton-board') {
    const set = state.sets[state.activeSetIndex];
    const ta = set?.teamA ?? 0;
    const tb = set?.teamB ?? 0;
    const serverScore = snapshot.serverTeam === 'teamA' ? ta : tb;
    return {
      ...snapshot,
      courtSide: badmintonCourtSideForServerScore(serverScore),
      tieBreakServeSlot: null,
      changeEndsBeforeNextPoint: badmintonChangeEndsBeforeNextPoint(ta, tb, rules.totalPointsPerSet),
      motionToken: `bd-${snapshot.motionToken}`,
    };
  }
  if (plugin.uiId === 'squash-board') {
    const set = state.sets[state.activeSetIndex];
    const ta = set?.teamA ?? 0;
    const tb = set?.teamB ?? 0;
    return {
      ...snapshot,
      tieBreakServeSlot: null,
      changeEndsBeforeNextPoint: squashChangeEndsBeforeNextPoint(ta, tb),
      motionToken: `sq-${snapshot.motionToken}`,
    };
  }
  if (plugin.uiId === 'pickleball-board') {
    const set = state.sets[state.activeSetIndex];
    const ta = set?.teamA ?? 0;
    const tb = set?.teamB ?? 0;
    const serverScore = snapshot.serverTeam === 'teamA' ? ta : tb;
    return {
      ...snapshot,
      courtSide: pickleballCourtSideForServerScore(serverScore),
      tieBreakServeSlot: matchDoubles ? pickleballDoublesServeSlot(snapshot.serverPlayerIndex) : null,
      changeEndsBeforeNextPoint: pickleballChangeEndsBeforeNextPoint(ta, tb, rules.totalPointsPerSet),
      motionToken: pickleballServeMotionToken(snapshot.motionToken),
    };
  }
  return snapshot;
}
