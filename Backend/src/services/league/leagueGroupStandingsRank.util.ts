/** Fixed-team group standings tie-break (season REGULAR fixtures). */

export type RankFixture = {
  aId: string;
  bId: string;
  /** Match winner participant id; null = draw or undecided. */
  winnerId: string | null;
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
};

export type RankParticipant = {
  id: string;
  wins: number;
  /** Used to park no-outcome rows (0–0–0) after active tie-break. */
  losses?: number;
  ties?: number;
};

type MiniStats = {
  wins: number;
  setDiff: number;
  gameDiff: number;
};

function stableId(a: string, b: string): number {
  return a.localeCompare(b);
}

/** No REGULAR outcomes yet — excluded from equal-wins collision resolve. */
export function hasNoStandingOutcome(p: {
  wins: number;
  losses?: number;
  ties?: number;
}): boolean {
  return p.wins === 0 && (p.losses ?? 0) === 0 && (p.ties ?? 0) === 0;
}

function fixturesAmong(ids: Set<string>, fixtures: RankFixture[]): RankFixture[] {
  return fixtures.filter((f) => ids.has(f.aId) && ids.has(f.bId));
}

function sideFor(fixture: RankFixture, id: string): 'A' | 'B' | null {
  if (fixture.aId === id) return 'A';
  if (fixture.bId === id) return 'B';
  return null;
}

function computeMiniStats(ids: string[], fixtures: RankFixture[]): Map<string, MiniStats> {
  const idSet = new Set(ids);
  const stats = new Map<string, MiniStats>();
  for (const id of ids) {
    stats.set(id, { wins: 0, setDiff: 0, gameDiff: 0 });
  }
  for (const f of fixturesAmong(idSet, fixtures)) {
    const a = stats.get(f.aId)!;
    const b = stats.get(f.bId)!;
    a.setDiff += f.setsA - f.setsB;
    b.setDiff += f.setsB - f.setsA;
    a.gameDiff += f.gamesA - f.gamesB;
    b.gameDiff += f.gamesB - f.gamesA;
    if (f.winnerId === f.aId) a.wins += 1;
    else if (f.winnerId === f.bId) b.wins += 1;
  }
  return stats;
}

/** Negative if a ranks above b. */
function compareMini(a: MiniStats, b: MiniStats): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
  if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
  return 0;
}

function miniEqual(a: MiniStats, b: MiniStats): boolean {
  return compareMini(a, b) === 0;
}

/** Negative if aId ranks above bId via head-to-head match wins. */
export function compareHeadToHead(
  aId: string,
  bId: string,
  fixtures: RankFixture[]
): number {
  let aWins = 0;
  let bWins = 0;
  for (const f of fixtures) {
    const aSide = sideFor(f, aId);
    const bSide = sideFor(f, bId);
    if (!aSide || !bSide || aSide === bSide) continue;
    if (f.winnerId === aId) aWins += 1;
    else if (f.winnerId === bId) bWins += 1;
  }
  if (aWins !== bWins) return bWins - aWins;
  return 0;
}

function partitionByEqualWins(participants: RankParticipant[]): RankParticipant[][] {
  const sorted = [...participants].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return stableId(a.id, b.id);
  });
  const groups: RankParticipant[][] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[0].wins === p.wins) last.push(p);
    else groups.push([p]);
  }
  return groups;
}

function partitionEqualMini(orderedIds: string[], stats: Map<string, MiniStats>): string[][] {
  const groups: string[][] = [];
  for (const id of orderedIds) {
    const last = groups[groups.length - 1];
    if (last && miniEqual(stats.get(last[0])!, stats.get(id)!)) last.push(id);
    else groups.push([id]);
  }
  return groups;
}

function resolvePair(aId: string, bId: string, fixtures: RankFixture[]): string[] {
  const h2h = compareHeadToHead(aId, bId, fixtures);
  if (h2h < 0) return [aId, bId];
  if (h2h > 0) return [bId, aId];
  return [aId, bId].sort(stableId);
}

function resolveCluster(ids: string[], fixtures: RankFixture[]): string[] {
  if (ids.length <= 1) return ids;
  if (ids.length === 2) return resolvePair(ids[0], ids[1], fixtures);

  const stats = computeMiniStats(ids, fixtures);
  const ordered = [...ids].sort((a, b) => {
    const c = compareMini(stats.get(a)!, stats.get(b)!);
    if (c !== 0) return c;
    return stableId(a, b);
  });
  const sub = partitionEqualMini(ordered, stats);

  if (sub.length === 1 && sub[0].length === ids.length) {
    return [...ids].sort(stableId);
  }

  const out: string[] = [];
  for (const group of sub) {
    if (group.length === 1) out.push(group[0]);
    else if (group.length === 2) out.push(...resolvePair(group[0], group[1], fixtures));
    else out.push(...resolveCluster(group, fixtures));
  }
  return out;
}

/**
 * Rank fixed-team participants in one group.
 * 1) match wins; 2) two-way H2H; 3) 3+ mini-table (wins → set Δ → game Δ);
 * 4) two left equal after mini → H2H.
 * No-outcome (0–0–0) rows stay after active teams in the same wins bucket.
 */
export function rankFixedTeamGroupStandings(
  participants: RankParticipant[],
  fixtures: RankFixture[]
): string[] {
  if (participants.length === 0) return [];
  const ordered: string[] = [];
  for (const cluster of partitionByEqualWins(participants)) {
    const active = cluster.filter((p) => !hasNoStandingOutcome(p));
    const idle = cluster.filter((p) => hasNoStandingOutcome(p));
    if (active.length === 1) ordered.push(active[0].id);
    else if (active.length > 1) {
      ordered.push(...resolveCluster(active.map((p) => p.id), fixtures));
    }
    ordered.push(...[...idle].map((p) => p.id).sort(stableId));
  }
  return ordered;
}

export type EqualWinsTieClusterRow = {
  participantId: string;
  miniWins: number;
  setDiff: number;
  gameDiff: number;
};

export type EqualWinsTieCluster = {
  seasonWins: number;
  rows: EqualWinsTieClusterRow[];
};

/**
 * Equal-wins collision clusters for display (H2H / mini-table).
 * Skips teams with no outcomes yet (0 wins / 0 losses / 0 ties).
 * Row order matches `rankFixedTeamGroupStandings` for the same active set.
 */
export function buildEqualWinsTieClusters(
  participants: Array<{ id: string; wins: number; losses: number; ties?: number }>,
  fixtures: RankFixture[]
): EqualWinsTieCluster[] {
  const out: EqualWinsTieCluster[] = [];
  for (const cluster of partitionByEqualWins(participants)) {
    const eligible = cluster.filter((p) => !hasNoStandingOutcome(p));
    if (eligible.length < 2) continue;
    const rankInput = eligible.map((p) => ({
      id: p.id,
      wins: p.wins,
      losses: p.losses,
      ties: p.ties ?? 0,
    }));
    const idSet = new Set(rankInput.map((p) => p.id));
    const among = fixturesAmong(idSet, fixtures);
    const orderedIds = rankFixedTeamGroupStandings(rankInput, among);
    const stats = computeMiniStats(orderedIds, among);
    out.push({
      seasonWins: eligible[0].wins,
      rows: orderedIds.map((id) => {
        const s = stats.get(id)!;
        return {
          participantId: id,
          miniWins: s.wins,
          setDiff: s.setDiff,
          gameDiff: s.gameDiff,
        };
      }),
    });
  }
  return out;
}

/** Season-wide set difference (sets won − sets lost) from fixtures. */
export function computeParticipantSetDeltas(fixtures: RankFixture[]): Map<string, number> {
  const map = new Map<string, number>();
  const add = (id: string, d: number) => map.set(id, (map.get(id) ?? 0) + d);
  for (const f of fixtures) {
    add(f.aId, f.setsA - f.setsB);
    add(f.bId, f.setsB - f.setsA);
  }
  return map;
}

/** Season-wide game/ball difference (fixture gamesA − gamesB) — same unit as mini-table game Δ. */
export function computeParticipantGameDeltas(fixtures: RankFixture[]): Map<string, number> {
  const map = new Map<string, number>();
  const add = (id: string, d: number) => map.set(id, (map.get(id) ?? 0) + d);
  for (const f of fixtures) {
    add(f.aId, f.gamesA - f.gamesB);
    add(f.bId, f.gamesB - f.gamesA);
  }
  return map;
}

/** Reorder rows by ranked participant ids; unknown ids keep relative order at end. */
export function orderByRankedIds<T extends { id: string }>(
  rows: T[],
  rankedIds: string[]
): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const used = new Set<string>();
  const out: T[] = [];
  for (const id of rankedIds) {
    const row = byId.get(id);
    if (row) {
      out.push(row);
      used.add(id);
    }
  }
  for (const row of rows) {
    if (!used.has(row.id)) out.push(row);
  }
  return out;
}
