/** Pairings when round-robin history is incomplete or the team set changed mid-season. */

import blossom from 'edmonds-blossom';

export function teamPlayerSig(playerIds: string[]): string {
  return [...playerIds].map(String).sort().join(',');
}

export function matchupKeyFromSigs(sigA: string, sigB: string): string {
  return sigA < sigB ? `${sigA}|${sigB}` : `${sigB}|${sigA}`;
}

export function everyMatchupUntracked(sigs: string[], playCounts: Map<string, number>): boolean {
  const n = sigs.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sigs[i] === sigs[j]) continue;
      if ((playCounts.get(matchupKeyFromSigs(sigs[i], sigs[j])) ?? 0) > 0) return false;
    }
  }
  return true;
}

/**
 * Minimize sum of weight(i,j) over a maximum matching. Even n: perfect matching on all teams.
 * Odd n: one bye via dummy vertex (Edmonds blossom).
 */
export function findMinCostMaxMatching(n: number, weight: (i: number, j: number) => number): [number, number][] {
  if (n < 2) return [];

  let maxW = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = weight(i, j);
      if (w > maxW) maxW = w;
    }
  }
  const BASE = n * (maxW + 1) + 100;

  if (n % 2 === 0) {
    const edges: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        edges.push([i, j, BASE - weight(i, j)]);
      }
    }
    const mate = blossom(edges, false) as number[];
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const j = mate[i];
      if (j == null || j < 0) continue;
      if (i < j) pairs.push([i, j]);
    }
    if (pairs.length !== n / 2) {
      throw new Error(`findMinCostMaxMatching: expected ${n / 2} pairs, got ${pairs.length}`);
    }
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return pairs;
  }

  const dummy = n;
  const edges: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    edges.push([i, dummy, 1]);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push([i, j, BASE - weight(i, j)]);
    }
  }
  const mate = blossom(edges, false) as number[];
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = mate[i];
    if (j == null || j < 0 || j === dummy) continue;
    if (i < j) pairs.push([i, j]);
  }
  const expect = Math.floor(n / 2);
  if (pairs.length !== expect) {
    throw new Error(`findMinCostMaxMatching (odd n): expected ${expect} pairs, got ${pairs.length}`);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return pairs;
}
