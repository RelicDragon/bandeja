import type { ScoringPreset } from '@/types';
import { Sports, isSport, type Sport } from '@shared/sport';
import {
  officiatingIsStrict,
  officiatingShowsHonorHints,
  type OfficiatingLevel,
} from '@shared/officiatingLevel';
import { getOfficiatingLevelForGame } from '@/sport/createFlow';
import { parseGameSport } from '@/utils/gameSport';
import { getRulesFromPreset, isPointsRules, type ScoringRules } from '@/utils/scoring';
import { isWeakTimedCustomLive } from '@shared/timedCustomPresets';
import {
  computeServeGuideSnapshot,
  firstServerForPointsSet,
  needsServeSetup,
  type LiveScoringState,
  type ServeGuideSnapshot,
} from '@/utils/liveScoring';

function playerDisplay(names: string[], index: number): string {
  if (!names.length) return '—';
  return names[index] ?? names[0] ?? '—';
}
import {
  tableTennisChangeEndsBeforeNextPoint,
  tableTennisCourtEndsSwapped,
  tableTennisIsDecidingGame,
  tableTennisNextServerTeam,
} from '@/utils/liveScoring/tableTennisServeGuide';
import {
  badmintonChangeEndsBeforeNextPoint,
  badmintonCourtSideForServerScore,
} from '@/utils/liveScoring/badmintonServe';
import {
  squashChangeEndsBeforeNextPoint,
  squashCourtEndsSwapped,
  squashCourtSideForServerScore,
  squashNextServerTeam,
} from '@/utils/liveScoring/squashServe';
import {
  pickleballChangeEndsBeforeNextPoint,
  pickleballCourtEndsSwapped,
  pickleballCourtSideForServerScore,
  pickleballDoublesPlayerIndex,
  pickleballDoublesServeSlot,
  pickleballIsDecidingGame,
  pickleballNextServerTeam,
  pickleballServeMotionToken,
} from '@/utils/liveScoring/pickleballServe';
import { getSportConfig } from '@/sport/sportRegistry';

export type LiveScoringEngineId = 'padel-default' | 'tennis-phase2' | 'rally-points';

export type LiveScoringUiId =
  | 'padel-court'
  | 'tennis-court'
  | 'americano-points'
  | 'table-tennis-board'
  | 'badminton-board'
  | 'pickleball-board'
  | 'squash-board';

const RALLY_BOARD_UI_IDS: ReadonlySet<LiveScoringUiId> = new Set([
  'table-tennis-board',
  'badminton-board',
  'pickleball-board',
  'squash-board',
]);

export type LiveScoringPlugin = {
  engineId: LiveScoringEngineId;
  uiId: LiveScoringUiId;
  serveGuideEnabled: boolean;
  officiatingLevel: OfficiatingLevel;
};

const TENNIS_PRESETS: ReadonlySet<ScoringPreset | 'DERIVED'> = new Set([
  'CLASSIC_BEST_OF_3',
  'CLASSIC_BEST_OF_5',
  'CLASSIC_PRO_SET',
  'CLASSIC_SHORT_SET',
  'CLASSIC_FAST4',
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

function withOfficiating(
  base: Omit<LiveScoringPlugin, 'officiatingLevel'>,
  officiatingLevel: OfficiatingLevel,
): LiveScoringPlugin {
  return { ...base, officiatingLevel };
}

function pluginOfficiatingLevel(
  sport: Sport,
  preset: ScoringPreset | 'DERIVED',
  metadata?: unknown,
): OfficiatingLevel {
  if (preset === 'DERIVED') return 'none';
  return getOfficiatingLevelForGame(sport, preset, metadata);
}

const RALLY_UI_BY_SPORT: Record<RallySport, LiveScoringUiId> = {
  [Sports.TABLE_TENNIS]: 'table-tennis-board',
  [Sports.BADMINTON]: 'badminton-board',
  [Sports.PICKLEBALL]: 'pickleball-board',
  [Sports.SQUASH]: 'squash-board',
};

/** Open-ended TIMED / zero-cap CUSTOM — ball-cap UI, not sport rally board (parity with Watch). */
export function usesOpenEndedPointsUi(
  preset: ScoringPreset | 'DERIVED',
  rules?: Pick<ScoringRules, 'ballsInGames' | 'totalPointsPerSet'>,
): boolean {
  if (preset === 'TIMED') return true;
  if (preset === 'CUSTOM') {
    if (rules) return !rules.ballsInGames && rules.totalPointsPerSet <= 0;
    const sk = getRulesFromPreset('CUSTOM');
    return !sk.ballsInGames && sk.totalPointsPerSet <= 0;
  }
  return false;
}

function openEndedRallyPlugin(
  sport: RallySport,
  preset: ScoringPreset | 'DERIVED',
  metadata?: unknown,
): LiveScoringPlugin {
  return withOfficiating(
    {
      engineId: 'rally-points',
      uiId: 'americano-points',
      serveGuideEnabled: false,
    },
    pluginOfficiatingLevel(sport, preset, metadata),
  );
}

function rallyPlugin(sport: RallySport, preset: ScoringPreset | 'DERIVED', metadata?: unknown): LiveScoringPlugin {
  return withOfficiating(
    {
      engineId: 'rally-points',
      uiId: RALLY_UI_BY_SPORT[sport],
      serveGuideEnabled:
        sport === Sports.TABLE_TENNIS ||
        sport === Sports.BADMINTON ||
        sport === Sports.SQUASH ||
        sport === Sports.PICKLEBALL,
    },
    pluginOfficiatingLevel(sport, preset, metadata),
  );
}

function isRallySport(sport: unknown): sport is RallySport {
  return isSport(sport) && RALLY_SPORTS.has(sport);
}

export function isRallyLiveScoringPlugin(plugin: LiveScoringPlugin): boolean {
  return RALLY_BOARD_UI_IDS.has(plugin.uiId);
}

/** Watch/FE weak live: pickleball open-ended skips server PATCH (local scoring only). */
export function openEndedLivePatchBlocked(sport: unknown, preset: ScoringPreset | 'DERIVED'): boolean {
  const s = parseGameSport(sport);
  return isWeakTimedCustomLive(s, preset);
}

export function liveScoringOfficiatingHintsEnabled(plugin: LiveScoringPlugin): boolean {
  return officiatingShowsHonorHints(plugin.officiatingLevel);
}

export function liveScoringOfficiatingStrictEnabled(plugin: LiveScoringPlugin): boolean {
  return officiatingIsStrict(plugin.officiatingLevel);
}

export function liveScoringServeGuideEnabled(
  sport: unknown,
  plugin: LiveScoringPlugin,
  rules?: ScoringRules,
): boolean {
  if (!plugin.serveGuideEnabled) return false;
  if (rules && isPointsRules(rules)) return false;
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
  gameMetadata?: unknown,
): LiveScoringPlugin {
  const s = parseGameSport(sport);
  const officiating = pluginOfficiatingLevel(s, preset, gameMetadata);
  if (s === Sports.TENNIS && TENNIS_PRESETS.has(preset)) {
    return withOfficiating(
      { engineId: 'tennis-phase2', uiId: 'tennis-court', serveGuideEnabled: true },
      officiating,
    );
  }
  if (isRallySport(s)) {
    if (usesOpenEndedPointsUi(preset)) return openEndedRallyPlugin(s, preset, gameMetadata);
    return rallyPlugin(s, preset, gameMetadata);
  }
  return withOfficiating(
    { engineId: 'padel-default', uiId: 'padel-court', serveGuideEnabled: true },
    officiating,
  );
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
  const matchDoubles = playersPerMatch === 4;
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
    const ta = set?.teamA ?? 0;
    const tb = set?.teamB ?? 0;
    const t = ta + tb;
    const first = state.firstServerTeam;
    const firstForSet = first ? firstServerForPointsSet(state.activeSetIndex, state.sets, first) : snapshot.serverTeam;
    const deciding = tableTennisIsDecidingGame(state, rules);
    return {
      ...snapshot,
      serverTeam: tableTennisNextServerTeam(firstForSet, t, ta, tb),
      tieBreakServeSlot: null,
      changeEndsBeforeNextPoint: tableTennisChangeEndsBeforeNextPoint(t, state.activeSetIndex, deciding),
      courtEndsSwapped: tableTennisCourtEndsSwapped(state, t, deciding),
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
    const first = state.firstServerTeam ?? snapshot.serverTeam;
    const firstForSet = firstServerForPointsSet(state.activeSetIndex, state.sets, first);
    const serverTeam = squashNextServerTeam(state, firstForSet);
    const serverScore = serverTeam === 'teamA' ? ta : tb;
    return {
      ...snapshot,
      serverTeam,
      courtSide: squashCourtSideForServerScore(serverScore),
      tieBreakServeSlot: null,
      changeEndsBeforeNextPoint: squashChangeEndsBeforeNextPoint(ta, tb),
      courtEndsSwapped: squashCourtEndsSwapped(state, ta, tb),
      motionToken: `sq-${snapshot.motionToken}`,
    };
  }
  if (plugin.uiId === 'pickleball-board') {
    const set = state.sets[state.activeSetIndex];
    const ta = set?.teamA ?? 0;
    const tb = set?.teamB ?? 0;
    const first = state.firstServerTeam ?? snapshot.serverTeam;
    const firstForSet = firstServerForPointsSet(state.activeSetIndex, state.sets, first);
    const isDeciding = pickleballIsDecidingGame(state, rules);
    const serverTeam = pickleballNextServerTeam(state, firstForSet);
    const serverScore = serverTeam === 'teamA' ? ta : tb;
    const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
    const playerIdx = matchDoubles
      ? pickleballDoublesPlayerIndex(state, firstForSet, first, matchFirstPlayerIdx, ta, tb)
      : 0;
    const namesForTeam = serverTeam === 'teamA' ? teamAPlayerNames : teamBPlayerNames;
    const display = matchDoubles ? playerDisplay(namesForTeam, playerIdx) : namesForTeam[0] ?? '—';
    const t = ta + tb;
    return {
      ...snapshot,
      serverTeam,
      serverPlayerIndex: playerIdx,
      serverDisplayName: display,
      courtSide: pickleballCourtSideForServerScore(serverScore),
      tieBreakServeSlot: matchDoubles ? pickleballDoublesServeSlot(playerIdx) : null,
      changeEndsBeforeNextPoint: pickleballChangeEndsBeforeNextPoint(ta, tb, rules.totalPointsPerSet, {
        isDecidingGame: isDeciding,
        activeSetIndex: state.activeSetIndex,
        totalPointsInGame: t,
      }),
      courtEndsSwapped: pickleballCourtEndsSwapped(state, ta, tb, rules),
      motionToken: pickleballServeMotionToken(`pts-${t}-${serverTeam}-${playerIdx}-${state.activeSetIndex}`),
    };
  }
  return snapshot;
}
