export type BracketSlotKind = 'PLAY_IN' | 'BYE' | 'MAIN';

export const BRACKET_MIN_ENTRANTS = 2;
export const BRACKET_MAX_ENTRANTS = 16;

export interface BracketPlayInMatchup {
  matchIndex: number;
  seedA: number;
  seedB: number;
  participantAId?: string;
  participantBId?: string;
}

export interface BracketByeSlot {
  seed: number;
  participantId?: string;
}

export interface BracketMainRoundPreview {
  roundIndex: number;
  labelKey: BracketMainRoundLabelKey;
  matchCount: number;
}

export type BracketMainRoundLabelKey = 'final' | 'semifinals' | 'quarterfinals' | 'roundOf16' | 'roundOf32';

export interface BracketStructureMetrics {
  entrantCount: number;
  bracketSize: number;
  byeCount: number;
  playInTeams: number;
  playInGameCount: number;
  firstMainRoundLabelKey: BracketMainRoundLabelKey;
  byeSeeds: number[];
  playInMatchups: BracketPlayInMatchup[];
  mainRounds: BracketMainRoundPreview[];
}

export interface BracketPlan extends BracketStructureMetrics {
  orderedParticipantIds: string[];
}

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 2;
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

export function getBracketStructureMetrics(
  entrantCount: number,
  customByeSeedRanks?: number[]
): BracketStructureMetrics {
  if (entrantCount < BRACKET_MIN_ENTRANTS || entrantCount > BRACKET_MAX_ENTRANTS) {
    throw new RangeError(`entrantCount must be ${BRACKET_MIN_ENTRANTS}..${BRACKET_MAX_ENTRANTS}`);
  }

  const bracketSize = nextPowerOf2(entrantCount);
  const byeCount = bracketSize - entrantCount;
  const playInTeams = entrantCount < bracketSize ? entrantCount - byeCount : 0;
  const playInGameCount = playInTeams / 2;
  const byeSeeds =
    customByeSeedRanks?.length === byeCount
      ? [...customByeSeedRanks].sort((a, b) => a - b)
      : Array.from({ length: byeCount }, (_, i) => i + 1);
  const playInMatchups = buildPlayInMatchups(entrantCount, new Set(byeSeeds));
  const mainRounds = buildMainRoundPreviews(bracketSize);

  return {
    entrantCount,
    bracketSize,
    byeCount,
    playInTeams,
    playInGameCount,
    firstMainRoundLabelKey: mainRounds[0]?.labelKey ?? 'final',
    byeSeeds,
    playInMatchups,
    mainRounds,
  };
}

export interface BuildBracketPlanOptions {
  customByeSeedRanks?: number[];
  playInSeedPairs?: Array<[number, number]>;
}

export function buildBracketPlan(
  entrantCount: number,
  orderedParticipantIds: string[],
  options?: BuildBracketPlanOptions
): BracketPlan {
  if (orderedParticipantIds.length !== entrantCount) {
    throw new Error('orderedParticipantIds length must match entrantCount');
  }
  const metrics = getBracketStructureMetrics(entrantCount, options?.customByeSeedRanks);
  const playInMatchups = (
    options?.playInSeedPairs?.length
      ? options.playInSeedPairs.map(([seedA, seedB], matchIndex) => ({ matchIndex, seedA, seedB }))
      : metrics.playInMatchups
  ).map((m) => ({
    ...m,
    participantAId: orderedParticipantIds[m.seedA - 1],
    participantBId: orderedParticipantIds[m.seedB - 1],
  }));

  return {
    ...metrics,
    orderedParticipantIds,
    playInMatchups,
  };
}

/** Standard 1-based first-round pairings for a power-of-2 bracket (NCAA order). */
export function standardFirstRoundPairings(bracketSize: number): Array<[number, number]> {
  if (bracketSize < 2 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new Error('bracketSize must be a power of 2');
  }
  const order = buildBracketSeedOrder(bracketSize);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([order[i], order[i + 1]]);
  }
  return pairs;
}

function buildBracketSeedOrder(bracketSize: number): number[] {
  let order = [1];
  while (order.length < bracketSize) {
    const len = order.length;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed);
      next.push(len * 2 + 1 - seed);
    }
    order = next;
  }
  return order;
}

function buildPlayInMatchups(entrantCount: number, byeSeeds: Set<number>): BracketPlayInMatchup[] {
  const bracketSize = nextPowerOf2(entrantCount);
  if (entrantCount >= bracketSize) return [];
  return standardFirstRoundPairings(bracketSize)
    .filter(([va, vb]) => !byeSeeds.has(va) && !byeSeeds.has(vb) && va <= entrantCount && vb <= entrantCount)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([seedA, seedB], matchIndex) => ({
      matchIndex,
      seedA,
      seedB,
    }));
}

function buildMainRoundPreviews(bracketSize: number): BracketMainRoundPreview[] {
  const rounds: BracketMainRoundPreview[] = [];
  let teams = bracketSize;
  let roundIndex = 0;
  while (teams > 1) {
    rounds.push({
      roundIndex,
      labelKey: mainRoundLabelKeyForTeams(teams),
      matchCount: teams / 2,
    });
    teams /= 2;
    roundIndex += 1;
  }
  return rounds;
}

function mainRoundLabelKeyForTeams(teamsInRound: number): BracketMainRoundLabelKey {
  switch (teamsInRound) {
    case 2:
      return 'final';
    case 4:
      return 'semifinals';
    case 8:
      return 'quarterfinals';
    case 16:
      return 'roundOf16';
    case 32:
      return 'roundOf32';
    default:
      return 'final';
  }
}

export function reorderPlayInMatchups(
  matchups: BracketPlayInMatchup[],
  fromMatchIndex: number,
  toMatchIndex: number,
  side: 'A' | 'B'
): BracketPlayInMatchup[] {
  if (fromMatchIndex === toMatchIndex && side === 'A') return matchups;
  const next = matchups.map((m) => ({ ...m }));
  const from = next[fromMatchIndex];
  const to = next[toMatchIndex];
  if (!from || !to) return matchups;
  const fromKey = side === 'A' ? 'seedA' : 'seedB';
  const swapSeed = from[fromKey];
  const otherKey = side === 'A' ? 'seedB' : 'seedA';
  const displaced = to[otherKey];
  from[fromKey] = displaced;
  to[otherKey] = swapSeed;
  return next;
}
