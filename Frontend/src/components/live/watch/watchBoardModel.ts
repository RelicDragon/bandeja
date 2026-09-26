import { isGoldenPointActive } from '@shared/gameFormat/goldenPoint';
import {
  getClassicPointLabels,
  liveSetLabelForRow,
  type LiveScoringState,
  type LiveSetLabel,
  type LiveTeamSide,
} from '@/utils/liveScoring';
import { getStandingsMatchOutcome, type ScoringRules } from '@/utils/scoring';

/**
 * Everything the spectator stage (`WatchStage`) draws, derived from the live
 * state in one pure pass so the component only lays it out. Same reading as
 * the scorer's TV board (`LiveTvScoreboard`): a column per set up to the
 * running one, then the points inside the running game.
 */
export type WatchSetColumn = {
  key: string;
  teamA: number;
  teamB: number;
  label: LiveSetLabel;
  active: boolean;
};

export type WatchPointStatus = 'tieBreak' | 'advantage' | 'goldenPoint' | 'deuce';

export type WatchBoardModel = {
  sets: WatchSetColumn[];
  /** Label of the running set, for the stage header. */
  activeLabel: LiveSetLabel;
  /** Points inside the running game; null in points mode and once the match is decided. */
  points: { teamA: string; teamB: string } | null;
  /** Who is ahead inside the running game — their point tile takes the accent. */
  pointLeader: LiveTeamSide | null;
  status: WatchPointStatus | null;
  inTieBreak: boolean;
  /** Only once the match is decided. */
  winner: LiveTeamSide | 'draw' | null;
};

function pointLeaderOf(state: LiveScoringState): LiveTeamSide | null {
  const classic = state.classic;
  if (!classic) return null;
  if (classic.withinSetTieBreak) {
    if (classic.tieBreakA === classic.tieBreakB) return null;
    return classic.tieBreakA > classic.tieBreakB ? 'teamA' : 'teamB';
  }
  const point = classic.pointState;
  if (point.kind === 'advantage') return point.side;
  if (point.kind === 'deuce' || point.teamA === point.teamB) return null;
  return point.teamA > point.teamB ? 'teamA' : 'teamB';
}

function statusOf(state: LiveScoringState, rules: ScoringRules): WatchPointStatus | null {
  const classic = state.classic;
  if (!classic) return null;
  if (classic.withinSetTieBreak) return 'tieBreak';
  const point = classic.pointState;
  if (point.kind === 'advantage') return 'advantage';
  // The engine keeps 40–40 as a regular score (`deuce` is legacy), so level at 40 is the deuce.
  const level40 = point.kind === 'deuce' || (point.teamA === 40 && point.teamB === 40);
  if (!level40) return null;
  return isGoldenPointActive(rules.deucesBeforeGoldenPoint, classic.deuceCount ?? 0) ? 'goldenPoint' : 'deuce';
}

export function watchBoardModel(
  state: LiveScoringState,
  rules: ScoringRules,
  matchDecided: boolean,
): WatchBoardModel {
  const count = Math.max(1, state.activeSetIndex + 1);
  const sets: WatchSetColumn[] = Array.from({ length: count }, (_, i) => {
    const row = state.sets[i] ?? { teamA: 0, teamB: 0 };
    return {
      key: `set-${i}`,
      teamA: row.teamA ?? 0,
      teamB: row.teamB ?? 0,
      label: liveSetLabelForRow(row, i, rules),
      active: i === state.activeSetIndex && !matchDecided,
    };
  });
  const activeLabel = sets[sets.length - 1].label;

  const classicRunning = state.mode === 'classic' && Boolean(state.classic) && !matchDecided;
  const labels = getClassicPointLabels(state.classic, rules);

  let winner: WatchBoardModel['winner'] = null;
  if (matchDecided) {
    const outcome = getStandingsMatchOutcome(state.sets, rules);
    if (outcome === 'A') winner = 'teamA';
    else if (outcome === 'B') winner = 'teamB';
    else if (outcome === 'tie') winner = 'draw';
    else {
      // An Automatic early finish can end before the standings call it; fall back to sets won.
      let a = 0;
      let b = 0;
      for (const col of sets) {
        if (col.teamA > col.teamB) a += 1;
        else if (col.teamB > col.teamA) b += 1;
      }
      winner = a === b ? null : a > b ? 'teamA' : 'teamB';
    }
  }

  return {
    sets,
    activeLabel,
    points: classicRunning ? { teamA: labels.teamA.toUpperCase(), teamB: labels.teamB.toUpperCase() } : null,
    pointLeader: classicRunning ? pointLeaderOf(state) : null,
    status: classicRunning ? statusOf(state, rules) : null,
    inTieBreak: classicRunning && Boolean(state.classic?.withinSetTieBreak),
    winner,
  };
}
