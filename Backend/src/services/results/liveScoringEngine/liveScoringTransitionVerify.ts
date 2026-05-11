import type { ScoringRules } from './rulebook';
import {
  advanceLiveSet,
  cancelPendingGameWin,
  confirmPendingGameWin,
  parseLiveScoringState,
  scoreLivePoint,
  unscoreLivePoint,
} from './core';
import type { LiveScoringState, SetResult } from './types';

/** Limits CPU on adversarial or degenerate state graphs. */
const MAX_NEIGHBORS_PER_NODE = 48;
const MAX_LAYER_WIDTH = 400;
const MAX_TOTAL_EXPANDED = 5000;

function stableSerialize(state: LiveScoringState): string {
  return JSON.stringify(state);
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
    const r0 = scoreLivePoint(prev, side, rules, {});
    if (r0.changed) push(r0.state);
    const r1 = scoreLivePoint(prev, side, rules, { confirmGameWin: true });
    if (r1.changed) push(r1.state);
    const u = unscoreLivePoint(prev, side, rules);
    if (u.changed) push(u.state);
  }
  const c = confirmPendingGameWin(prev, rules);
  if (c.changed) push(c.state);
  const x = cancelPendingGameWin(prev);
  if (x.changed) push(x.state);
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
