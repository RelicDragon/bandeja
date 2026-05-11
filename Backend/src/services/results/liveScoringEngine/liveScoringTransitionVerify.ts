import type { ScoringRules } from './rulebook';
import { advanceLiveSet, parseLiveScoringState, scoreLivePoint, unscoreLivePoint } from './core';
import type { LiveScoringState, SetResult } from './types';

/** Limits CPU on adversarial or degenerate state graphs. */
const MAX_NEIGHBORS_PER_NODE = 48;
const MAX_LAYER_WIDTH = 400;
const MAX_TOTAL_EXPANDED = 5000;

function sortKeysDeep(x: unknown): unknown {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  const o = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    const v = o[k];
    if (v === undefined) continue;
    out[k] = sortKeysDeep(v);
  }
  return out;
}

/** Strips DB-only / client-only set fields so BFS matches server vs optimistic payloads. */
function canonicalLiveScoringStateForTransitionCompare(state: LiveScoringState): unknown {
  const sets = state.sets.map((s) => ({
    teamA: s.teamA,
    teamB: s.teamB,
    isTieBreak: Boolean(s.isTieBreak),
  }));
  const out: Record<string, unknown> = {
    activeSetIndex: state.activeSetIndex,
    mode: state.mode,
    sets,
  };
  if (state.classic) {
    out.classic = {
      pointState: state.classic.pointState,
      withinSetTieBreak: state.classic.withinSetTieBreak,
      tieBreakA: state.classic.tieBreakA,
      tieBreakB: state.classic.tieBreakB,
      classicPointsPlayedInGame: state.classic.classicPointsPlayedInGame,
    };
  }
  if (state.firstServerTeam) out.firstServerTeam = state.firstServerTeam;
  if (typeof state.firstServerDoublesPlayerIndex === 'number') {
    out.firstServerDoublesPlayerIndex = state.firstServerDoublesPlayerIndex;
  }
  if (state.serveGuideSkipped === true) out.serveGuideSkipped = true;
  return sortKeysDeep(out);
}

function stableSerialize(state: LiveScoringState): string {
  return JSON.stringify(canonicalLiveScoringStateForTransitionCompare(state));
}

function expandNeighbors(prev: LiveScoringState, rules: ScoringRules): LiveScoringState[] {
  const out: LiveScoringState[] = [];
  const seen = new Set<string>();

  const push = (s: LiveScoringState) => {
    const k = stableSerialize(s);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };

  for (const side of ['teamA', 'teamB'] as const) {
    const r0 = scoreLivePoint(prev, side, rules);
    if (r0.changed) push(r0.state);
    const u = unscoreLivePoint(prev, side, rules);
    if (u.changed) push(u.state);
  }
  const a = advanceLiveSet(prev, rules);
  if (a.changed) push(a.state);

  for (const ft of ['teamA', 'teamB'] as const) {
    if (prev.firstServerTeam !== ft) {
      push({ ...prev, firstServerTeam: ft });
    }
  }
  if (prev.serveGuideSkipped !== true) {
    push({ ...prev, serveGuideSkipped: true });
  }

  const curIdx = prev.firstServerDoublesPlayerIndex;
  for (const idx of [0, 1] as const) {
    if (curIdx !== idx) {
      push({ ...prev, firstServerDoublesPlayerIndex: idx });
    }
  }
  if (curIdx !== undefined && curIdx !== null) {
    const cleared: LiveScoringState = { ...prev };
    delete (cleared as { firstServerDoublesPlayerIndex?: number }).firstServerDoublesPlayerIndex;
    push(cleared);
  }

  return out.slice(0, MAX_NEIGHBORS_PER_NODE);
}

export function isLiveScoringTransitionWithinSteps(
  prevRaw: Record<string, unknown> | null,
  nextRaw: Record<string, unknown> | null,
  rules: ScoringRules,
  fallbackSets: SetResult[],
  maxDepth: number
): boolean {
  if (nextRaw == null) return prevRaw == null;
  const prev = parseLiveScoringState(prevRaw, rules, fallbackSets);
  const target = parseLiveScoringState(nextRaw, rules, fallbackSets);
  if (stableSerialize(prev) === stableSerialize(target)) return true;

  let frontier: LiveScoringState[] = [prev];
  const targetKey = stableSerialize(target);
  let expanded = 0;
  for (let d = 0; d < maxDepth; d += 1) {
    const nextFrontier: LiveScoringState[] = [];
    for (const node of frontier) {
      for (const n of expandNeighbors(node, rules)) {
        expanded += 1;
        if (expanded > MAX_TOTAL_EXPANDED) {
          return false;
        }
        if (stableSerialize(n) === targetKey) return true;
        if (nextFrontier.length < MAX_LAYER_WIDTH) {
          nextFrontier.push(n);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }
  return false;
}
