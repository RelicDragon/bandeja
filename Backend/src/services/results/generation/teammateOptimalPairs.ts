import munkres from 'munkres';
import blossom from 'edmonds-blossom';
import { pairKey } from './matchUtils';

const HUNGARIAN_FORBIDDEN = 1e12;

function countBetween(partnerCounts: Map<string, number>, a: string, b: string): number {
  return partnerCounts.get(pairKey(a, b)) || 0;
}

function bipartitePerfectMatchingExists(adj: number[][]): boolean {
  const n = adj.length;
  const matchR = new Array<number>(n).fill(-1);

  function dfs(u: number, seen: boolean[]): boolean {
    for (const v of adj[u]) {
      if (seen[v]) continue;
      seen[v] = true;
      if (matchR[v] === -1 || dfs(matchR[v], seen)) {
        matchR[v] = u;
        return true;
      }
    }
    return false;
  }

  for (let u = 0; u < n; u++) {
    const seen = new Array<boolean>(n).fill(false);
    if (!dfs(u, seen)) return false;
  }
  return true;
}

function mixSmallestFeasibleMaxT(
  males: string[],
  females: string[],
  partnerCounts: Map<string, number>
): number {
  const n = males.length;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = countBetween(partnerCounts, males[i], females[j]);
      if (c > hi) hi = c;
    }
  }
  let lo = 0;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const adj: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (countBetween(partnerCounts, males[i], females[j]) <= mid) row.push(j);
      }
      adj.push(row);
    }
    if (bipartitePerfectMatchingExists(adj)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function solveMixOptimalPairs(
  males: string[],
  females: string[],
  partnerCounts: Map<string, number>
): [string, string][] | null {
  const n = Math.min(males.length, females.length);
  if (n === 0) return [];
  const m = males.slice(0, n);
  const f = females.slice(0, n);

  const T = mixSmallestFeasibleMaxT(m, f, partnerCounts);
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const c = countBetween(partnerCounts, m[i], f[j]);
      row.push(c <= T ? c : HUNGARIAN_FORBIDDEN);
    }
    matrix.push(row);
  }

  const indices = munkres(matrix);
  if (indices.length !== n) return null;

  const pairs: [string, string][] = [];
  for (const [i, j] of indices) {
    if (matrix[i][j] >= HUNGARIAN_FORBIDDEN) return null;
    pairs.push([m[i], f[j]]);
  }
  return pairs;
}

function buildStandardCountMatrix(ids: string[], partnerCounts: Map<string, number>): number[][] {
  const n = ids.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = countBetween(partnerCounts, ids[i], ids[j]);
      m[i][j] = c;
      m[j][i] = c;
    }
  }
  return m;
}

function standardSmallestFeasibleMaxT(counts: number[][]): number {
  const n = counts.length;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (counts[i][j] > hi) hi = counts[i][j];
    }
  }
  let lo = 0;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const edges: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (counts[i][j] <= mid) edges.push([i, j, 1]);
      }
    }
    const mate = blossom(edges, true) as number[];
    let matchedVerts = 0;
    for (let i = 0; i < n; i++) {
      if (mate[i] !== -1) matchedVerts++;
    }
    if (matchedVerts === n) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function mateToPairs(ids: string[], mate: number[]): [string, string][] | null {
  const n = ids.length;
  const pairs: [string, string][] = [];
  for (let i = 0; i < n; i++) {
    const j = mate[i];
    if (j === -1) return null;
    if (i < j) pairs.push([ids[i], ids[j]]);
  }
  if (pairs.length !== n / 2) return null;
  return pairs;
}

export function solveStandardOptimalPairs(
  playerIds: string[],
  partnerCounts: Map<string, number>
): [string, string][] | null {
  const n = playerIds.length;
  if (n === 0) return [];
  if (n % 2 !== 0) return null;

  const counts = buildStandardCountMatrix(playerIds, partnerCounts);
  const T = standardSmallestFeasibleMaxT(counts);

  const mPairs = n / 2;
  // Maximize sum(BASE - c) among matchings. For BASE > mPairs * T, any perfect
  // matching beats any imperfect one on total weight; among perfect matchings,
  // maximizing weight minimizes sum(c).
  const BASE = mPairs * (T + 1) + 1;

  const edges: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = counts[i][j];
      if (c <= T) edges.push([i, j, BASE - c]);
    }
  }

  const mate = blossom(edges, false) as number[];
  return mateToPairs(playerIds, mate);
}
