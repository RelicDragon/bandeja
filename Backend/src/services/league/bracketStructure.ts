import { BracketSlotKind } from '@prisma/client';

export const BRACKET_TEMPLATE_VERSION = 1;

const SUPPORTED_BRACKET_SIZES = [2, 4, 8, 16] as const;

export function nextPowerOf2(n: number): number {
  if (n < 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function mainFirstRoundPairings(bracketSize: number): [number, number][] {
  if (!SUPPORTED_BRACKET_SIZES.includes(bracketSize as (typeof SUPPORTED_BRACKET_SIZES)[number])) {
    throw new Error(`Unsupported bracketSize: ${bracketSize}`);
  }
  switch (bracketSize) {
    case 2:
      return [[1, 2]];
    case 4:
      return [
        [1, 4],
        [2, 3],
      ];
    case 8:
      return [
        [1, 8],
        [4, 5],
        [2, 7],
        [3, 6],
      ];
    case 16:
      return [
        [1, 16],
        [8, 9],
        [4, 13],
        [5, 12],
        [2, 15],
        [7, 10],
        [3, 14],
        [6, 11],
      ];
    default:
      return [];
  }
}

export function playInTeamCount(entrantCount: number, bracketSize: number): number {
  if (entrantCount === bracketSize) return 0;
  return entrantCount - byeCount(entrantCount, bracketSize);
}

export function byeCount(entrantCount: number, bracketSize: number): number {
  return bracketSize - entrantCount;
}

export function playInPairings(
  entrantCount: number,
  bracketSize: number,
  byeSeedRanks?: number[]
): [number, number][] {
  const bye = byeCount(entrantCount, bracketSize);
  if (entrantCount === bracketSize) return [];
  const byeSet = new Set(byeSeedRanks ?? Array.from({ length: bye }, (_, i) => i + 1));
  const result: [number, number][] = [];
  for (const [va, vb] of mainFirstRoundPairings(bracketSize)) {
    if (byeSet.has(va) || byeSet.has(vb)) continue;
    if (va > entrantCount || vb > entrantCount) continue;
    result.push([va, vb]);
  }
  result.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return result;
}

export function mainRoundCount(bracketSize: number): number {
  return Math.log2(bracketSize);
}

export function mainRoundLabel(bracketSize: number, roundIndex: number): string {
  const total = mainRoundCount(bracketSize);
  const remaining = total - roundIndex;
  if (remaining === 1) return 'Final';
  if (bracketSize === 16 && roundIndex === 0) return 'Round of 16';
  if (remaining === 2) return 'Semifinals';
  if (remaining === 3) return 'Quarterfinals';
  return `Round ${roundIndex + 1}`;
}

/** MAIN R0 match count for a bracket (feeds consolation when ≥2). */
export function mainR0MatchCount(entrantCount: number, byeSeedRanks?: number[]): number {
  const bracketSize = nextPowerOf2(entrantCount);
  void byeSeedRanks;
  const hasPlayInPhase = playInTeamCount(entrantCount, bracketSize) > 0;
  const r0Pairings = hasPlayInPhase
    ? mainFirstRoundPairings(bracketSize / 2)
    : mainFirstRoundPairings(bracketSize);
  return r0Pairings.length;
}

export function supportsConsolationBracket(entrantCount: number, byeSeedRanks?: number[]): boolean {
  return mainR0MatchCount(entrantCount, byeSeedRanks) >= 2;
}

export function consolationRoundLabel(consolationSize: number, roundIndex: number): string {
  return mainRoundLabel(consolationSize, roundIndex);
}

export function losersRoundLabel(losersSize: number, roundIndex: number): string {
  return mainRoundLabel(losersSize, roundIndex);
}

export function supportsDoubleElimination(entrantCount: number, byeSeedRanks?: number[]): boolean {
  return supportsConsolationBracket(entrantCount, byeSeedRanks);
}

export interface PlannedBracketSlot {
  slotKey: string;
  slotKind: BracketSlotKind;
  phaseIndex: number;
  roundIndex: number;
  matchIndex: number;
  leagueParticipantId: string | null;
  seedRank: number | null;
  seedRankA: number | null;
  seedRankB: number | null;
  winnerSlotKey: string | null;
  feederSlotAKey: string | null;
  feederSlotBKey: string | null;
  roundLabel: string;
}

export interface CustomPlayInPairing {
  seedA: number;
  seedB: number;
}

export interface BuildBracketPlanOptions {
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  byeSeedRanks?: number[];
  customPlayInPairings?: CustomPlayInPairing[];
}

export function playInSeedPool(
  entrantCount: number,
  bracketSize: number,
  byeSeedRanks?: number[]
): number[] {
  const bye = byeCount(entrantCount, bracketSize);
  const byeSet = new Set(byeSeedRanks ?? Array.from({ length: bye }, (_, i) => i + 1));
  const pool: number[] = [];
  for (let s = 1; s <= entrantCount; s++) {
    if (!byeSet.has(s)) pool.push(s);
  }
  return pool;
}

export function validateCustomPlayInPairings(
  pairings: CustomPlayInPairing[],
  entrantCount: number,
  bracketSize: number,
  byeSeedRanks?: number[]
): void {
  if (pairings.length === 0) {
    throw new Error('customPlayInPairings must not be empty when play-in exists');
  }
  const pool = playInSeedPool(entrantCount, bracketSize, byeSeedRanks);
  const poolSet = new Set(pool);
  if (pool.length === 0) {
    throw new Error('customPlayInPairings requires a play-in phase');
  }
  const used = new Set<number>();
  for (const { seedA, seedB } of pairings) {
    if (!Number.isInteger(seedA) || !Number.isInteger(seedB)) {
      throw new Error('customPlayInPairings seeds must be integers');
    }
    if (seedA === seedB) {
      throw new Error('customPlayInPairings cannot pair a seed with itself');
    }
    if (!poolSet.has(seedA) || !poolSet.has(seedB)) {
      throw new Error('customPlayInPairings seeds must be in the play-in pool');
    }
    if (seedA < 1 || seedA > entrantCount || seedB < 1 || seedB > entrantCount) {
      throw new Error(`customPlayInPairings seeds must be in 1..${entrantCount}`);
    }
    for (const s of [seedA, seedB]) {
      if (used.has(s)) {
        throw new Error('customPlayInPairings must cover each play-in seed exactly once');
      }
      used.add(s);
    }
  }
  if (used.size !== pool.length) {
    throw new Error('customPlayInPairings must cover the full play-in pool');
  }
}

export interface BracketPlan {
  entrantCount: number;
  bracketSize: number;
  byeCount: number;
  playInGames: number;
  includeThirdPlace: boolean;
  includeConsolationBracket: boolean;
  includeDoubleElimination: boolean;
  bracketTemplateVersion: number;
  slots: PlannedBracketSlot[];
  initialGameSlotKeys: string[];
}

function participantAt(orderedParticipantIds: string[], seedRank: number): string {
  const id = orderedParticipantIds[seedRank - 1];
  if (!id) {
    throw new Error(`Missing participant for seed ${seedRank}`);
  }
  return id;
}

function virtualMainFeederKey(virtualSeed: number, byeSeeds: number[]): string {
  if (virtualSeed <= byeSeeds.length) {
    return `BYE-S${byeSeeds[virtualSeed - 1]}`;
  }
  return `PI-M${virtualSeed - byeSeeds.length - 1}`;
}

function feederResolvedAtCreate(feederKey: string): boolean {
  return feederKey.startsWith('BYE-S');
}

export function validateByeSeedRanks(
  byeSeedRanks: number[] | undefined,
  entrantCount: number,
  expectedByeCount: number
): void {
  if (!byeSeedRanks) return;
  if (byeSeedRanks.length !== expectedByeCount) {
    throw new Error(
      `customByeSeedRanks length must equal byeCount (${expectedByeCount}), got ${byeSeedRanks.length}`
    );
  }
  if (new Set(byeSeedRanks).size !== byeSeedRanks.length) {
    throw new Error('customByeSeedRanks must be unique');
  }
  for (const rank of byeSeedRanks) {
    if (!Number.isInteger(rank) || rank < 1 || rank > entrantCount) {
      throw new Error(`customByeSeedRanks must be integers in 1..${entrantCount}`);
    }
  }
}

export function buildBracketPlan(
  entrantCount: number,
  orderedParticipantIds: string[],
  options?: BuildBracketPlanOptions
): BracketPlan {
  if (entrantCount < 2 || entrantCount > 16) {
    throw new Error(`entrantCount must be 2..16, got ${entrantCount}`);
  }
  if (orderedParticipantIds.length !== entrantCount) {
    throw new Error('orderedParticipantIds length must match entrantCount');
  }

  const bracketSize = nextPowerOf2(entrantCount);
  const byes = byeCount(entrantCount, bracketSize);
  validateByeSeedRanks(options?.byeSeedRanks, entrantCount, byes);
  const byeSeeds =
    options?.byeSeedRanks ?? Array.from({ length: byes }, (_, i) => i + 1);
  const playInTeams = playInTeamCount(entrantCount, bracketSize);
  const defaultPiPairings = playInPairings(entrantCount, bracketSize, byeSeeds);
  if (options?.customPlayInPairings?.length) {
    validateCustomPlayInPairings(
      options.customPlayInPairings,
      entrantCount,
      bracketSize,
      byeSeeds
    );
    if (options.customPlayInPairings.length !== defaultPiPairings.length) {
      throw new Error(
        `customPlayInPairings length must be ${defaultPiPairings.length}, got ${options.customPlayInPairings.length}`
      );
    }
  }
  const piPairings: [number, number][] = options?.customPlayInPairings?.length
    ? options.customPlayInPairings.map((p) => [p.seedA, p.seedB])
    : defaultPiPairings;
  const playInGames = piPairings.length;
  const mainRounds = mainRoundCount(bracketSize);
  const includeThirdPlace = Boolean(options?.includeThirdPlace && bracketSize >= 4);
  const includeConsolationBracket = Boolean(
    options?.includeConsolationBracket && supportsConsolationBracket(entrantCount, byeSeeds)
  );
  const includeDoubleElimination = Boolean(
    options?.includeDoubleElimination && supportsDoubleElimination(entrantCount, byeSeeds)
  );
  if (includeConsolationBracket && includeDoubleElimination) {
    throw new Error('includeConsolationBracket and includeDoubleElimination are mutually exclusive');
  }
  const slots: PlannedBracketSlot[] = [];
  const hasPlayInPhase = playInTeams > 0;

  byeSeeds.forEach((seed, matchIndex) => {
    slots.push({
      slotKey: `BYE-S${seed}`,
      slotKind: BracketSlotKind.BYE,
      phaseIndex: 0,
      roundIndex: 0,
      matchIndex,
      leagueParticipantId: participantAt(orderedParticipantIds, seed),
      seedRank: seed,
      seedRankA: null,
      seedRankB: null,
      winnerSlotKey: null,
      feederSlotAKey: null,
      feederSlotBKey: null,
      roundLabel: 'Bye',
    });
  });

  piPairings.forEach(([seedA, seedB], matchIndex) => {
    slots.push({
      slotKey: `PI-M${matchIndex}`,
      slotKind: BracketSlotKind.PLAY_IN,
      phaseIndex: 0,
      roundIndex: 0,
      matchIndex,
      leagueParticipantId: null,
      seedRank: null,
      seedRankA: seedA,
      seedRankB: seedB,
      winnerSlotKey: null,
      feederSlotAKey: null,
      feederSlotBKey: null,
      roundLabel: 'Play-in',
    });
  });

  const r0Pairings = hasPlayInPhase
    ? mainFirstRoundPairings(bracketSize / 2)
    : mainFirstRoundPairings(bracketSize);
  for (let matchIndex = 0; matchIndex < r0Pairings.length; matchIndex++) {
    const [virtualA, virtualB] = r0Pairings[matchIndex];
    const winnerSlotKey = mainRounds > 1 ? `MAIN-R1-M${Math.floor(matchIndex / 2)}` : null;
    if (!hasPlayInPhase) {
      const seedA = virtualA;
      const seedB = virtualB;
      const a = seedA <= entrantCount ? seedA : null;
      const b = seedB <= entrantCount ? seedB : null;
      slots.push({
        slotKey: `MAIN-R0-M${matchIndex}`,
        slotKind: BracketSlotKind.MAIN,
        phaseIndex: 1,
        roundIndex: 0,
        matchIndex,
        leagueParticipantId: null,
        seedRank: null,
        seedRankA: a,
        seedRankB: b,
        winnerSlotKey,
        feederSlotAKey: null,
        feederSlotBKey: null,
        roundLabel: mainRoundLabel(bracketSize, 0),
      });
      continue;
    }
    const feederA = virtualMainFeederKey(virtualA, byeSeeds);
    const feederB = virtualMainFeederKey(virtualB, byeSeeds);
    slots.push({
      slotKey: `MAIN-R0-M${matchIndex}`,
      slotKind: BracketSlotKind.MAIN,
      phaseIndex: 1,
      roundIndex: 0,
      matchIndex,
      leagueParticipantId: null,
      seedRank: null,
      seedRankA: null,
      seedRankB: null,
      winnerSlotKey,
      feederSlotAKey: feederA,
      feederSlotBKey: feederB,
      roundLabel: mainRoundLabel(bracketSize, 0),
    });
    for (const feederKey of [feederA, feederB]) {
      const feeder = slots.find((s) => s.slotKey === feederKey);
      if (feeder) feeder.winnerSlotKey = `MAIN-R0-M${matchIndex}`;
    }
  }

  for (let roundIndex = 1; roundIndex < mainRounds; roundIndex++) {
    const matchesInRound = hasPlayInPhase
      ? Math.max(1, bracketSize / Math.pow(2, roundIndex + 2))
      : bracketSize / Math.pow(2, roundIndex + 1);
    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex++) {
      const feederA = `MAIN-R${roundIndex - 1}-M${matchIndex * 2}`;
      const feederB = `MAIN-R${roundIndex - 1}-M${matchIndex * 2 + 1}`;
      const isMainFinal = roundIndex === mainRounds - 1;
      const winnerSlotKey = isMainFinal
        ? includeDoubleElimination
          ? 'GRAND-FINAL-M0'
          : null
        : `MAIN-R${roundIndex + 1}-M${Math.floor(matchIndex / 2)}`;
      slots.push({
        slotKey: `MAIN-R${roundIndex}-M${matchIndex}`,
        slotKind: BracketSlotKind.MAIN,
        phaseIndex: 1,
        roundIndex,
        matchIndex,
        leagueParticipantId: null,
        seedRank: null,
        seedRankA: null,
        seedRankB: null,
        winnerSlotKey,
        feederSlotAKey: feederA,
        feederSlotBKey: feederB,
        roundLabel: mainRoundLabel(bracketSize, roundIndex),
      });
      const prevA = slots.find((s) => s.slotKey === feederA);
      const prevB = slots.find((s) => s.slotKey === feederB);
      if (prevA) prevA.winnerSlotKey = `MAIN-R${roundIndex}-M${matchIndex}`;
      if (prevB) prevB.winnerSlotKey = `MAIN-R${roundIndex}-M${matchIndex}`;
    }
  }

  if (includeThirdPlace && mainRounds >= 2) {
    const sfRoundIndex = mainRounds - 2;
    slots.push({
      slotKey: 'THIRD-M0',
      slotKind: BracketSlotKind.THIRD_PLACE,
      phaseIndex: 2,
      roundIndex: 0,
      matchIndex: 0,
      leagueParticipantId: null,
      seedRank: null,
      seedRankA: null,
      seedRankB: null,
      winnerSlotKey: null,
      feederSlotAKey: `MAIN-R${sfRoundIndex}-M0`,
      feederSlotBKey: `MAIN-R${sfRoundIndex}-M1`,
      roundLabel: 'Third place',
    });
  }

  if (includeConsolationBracket) {
    appendConsolationSlots(slots);
  }

  if (includeDoubleElimination) {
    appendLosersBracketSlots(slots);
    appendGrandFinalSlot(slots, mainRounds);
  }

  const initialGameSlotKeys: string[] = [];
  for (const slot of slots) {
    if (slot.slotKind === BracketSlotKind.PLAY_IN) {
      initialGameSlotKeys.push(slot.slotKey);
      continue;
    }
    if (slot.slotKind !== BracketSlotKind.MAIN) continue;
    if (!hasPlayInPhase && slot.roundIndex === 0 && slot.seedRankA && slot.seedRankB) {
      if (slot.seedRankA <= entrantCount && slot.seedRankB <= entrantCount) {
        initialGameSlotKeys.push(slot.slotKey);
      }
      continue;
    }
    if (!slot.feederSlotAKey || !slot.feederSlotBKey) continue;
    if (
      feederResolvedAtCreate(slot.feederSlotAKey) &&
      feederResolvedAtCreate(slot.feederSlotBKey)
    ) {
      initialGameSlotKeys.push(slot.slotKey);
    }
  }

  return {
    entrantCount,
    bracketSize,
    byeCount: byes,
    playInGames,
    includeThirdPlace,
    includeConsolationBracket,
    includeDoubleElimination,
    bracketTemplateVersion: BRACKET_TEMPLATE_VERSION,
    slots,
    initialGameSlotKeys,
  };
}

function appendLosersBracketSlots(slots: PlannedBracketSlot[]): void {
  const mainR0Keys = slots
    .filter((s) => s.slotKind === BracketSlotKind.MAIN && s.roundIndex === 0)
    .sort((a, b) => a.matchIndex - b.matchIndex)
    .map((s) => s.slotKey);
  const loserCount = mainR0Keys.length;
  if (loserCount < 2) return;

  const losersSize = loserCount;
  const losersRounds = mainRoundCount(losersSize);

  for (let roundIndex = 0; roundIndex < losersRounds; roundIndex++) {
    const matchesInRound = losersSize / Math.pow(2, roundIndex + 1);
    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex++) {
      let feederA: string;
      let feederB: string;
      if (roundIndex === 0) {
        feederA = mainR0Keys[matchIndex * 2]!;
        feederB = mainR0Keys[matchIndex * 2 + 1]!;
      } else {
        feederA = `LOS-R${roundIndex - 1}-M${matchIndex * 2}`;
        feederB = `LOS-R${roundIndex - 1}-M${matchIndex * 2 + 1}`;
      }
      const winnerSlotKey =
        roundIndex < losersRounds - 1
          ? `LOS-R${roundIndex + 1}-M${Math.floor(matchIndex / 2)}`
          : 'GRAND-FINAL-M0';
      slots.push({
        slotKey: `LOS-R${roundIndex}-M${matchIndex}`,
        slotKind: BracketSlotKind.LOSERS,
        phaseIndex: 3,
        roundIndex,
        matchIndex,
        leagueParticipantId: null,
        seedRank: null,
        seedRankA: null,
        seedRankB: null,
        winnerSlotKey,
        feederSlotAKey: feederA,
        feederSlotBKey: feederB,
        roundLabel: losersRoundLabel(losersSize, roundIndex),
      });
      const prevA = slots.find((s) => s.slotKey === feederA);
      const prevB = slots.find((s) => s.slotKey === feederB);
      if (prevA && prevA.slotKind === BracketSlotKind.LOSERS) {
        prevA.winnerSlotKey = `LOS-R${roundIndex}-M${matchIndex}`;
      }
      if (prevB && prevB.slotKind === BracketSlotKind.LOSERS) {
        prevB.winnerSlotKey = `LOS-R${roundIndex}-M${matchIndex}`;
      }
    }
  }
}

/** Grand final: winners-bracket champion vs losers-bracket champion. Same team in both feeders may skip GF (product choice; not auto-skipped here). */
function appendGrandFinalSlot(slots: PlannedBracketSlot[], mainRounds: number): void {
  const mainFinalKey = `MAIN-R${mainRounds - 1}-M0`;
  const losersFinal = slots
    .filter((s) => s.slotKind === BracketSlotKind.LOSERS)
    .sort((a, b) => b.roundIndex - a.roundIndex || a.matchIndex - b.matchIndex)[0];
  const losersChampionFeeder = losersFinal?.slotKey ?? null;
  if (!losersChampionFeeder) return;

  slots.push({
    slotKey: 'GRAND-FINAL-M0',
    slotKind: BracketSlotKind.GRAND_FINAL,
    phaseIndex: 4,
    roundIndex: 0,
    matchIndex: 0,
    leagueParticipantId: null,
    seedRank: null,
    seedRankA: null,
    seedRankB: null,
    winnerSlotKey: null,
    feederSlotAKey: mainFinalKey,
    feederSlotBKey: losersChampionFeeder,
    roundLabel: 'Grand final',
  });
}

function appendConsolationSlots(slots: PlannedBracketSlot[]): void {
  const mainR0Keys = slots
    .filter((s) => s.slotKind === BracketSlotKind.MAIN && s.roundIndex === 0)
    .sort((a, b) => a.matchIndex - b.matchIndex)
    .map((s) => s.slotKey);
  const loserCount = mainR0Keys.length;
  if (loserCount < 2) return;

  const consolationSize = loserCount;
  const consRounds = mainRoundCount(consolationSize);

  for (let roundIndex = 0; roundIndex < consRounds; roundIndex++) {
    const matchesInRound = consolationSize / Math.pow(2, roundIndex + 1);
    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex++) {
      let feederA: string;
      let feederB: string;
      if (roundIndex === 0) {
        feederA = mainR0Keys[matchIndex * 2]!;
        feederB = mainR0Keys[matchIndex * 2 + 1]!;
      } else {
        feederA = `CONS-R${roundIndex - 1}-M${matchIndex * 2}`;
        feederB = `CONS-R${roundIndex - 1}-M${matchIndex * 2 + 1}`;
      }
      const winnerSlotKey =
        roundIndex < consRounds - 1
          ? `CONS-R${roundIndex + 1}-M${Math.floor(matchIndex / 2)}`
          : null;
      slots.push({
        slotKey: `CONS-R${roundIndex}-M${matchIndex}`,
        slotKind: BracketSlotKind.CONSOLATION,
        phaseIndex: 3,
        roundIndex,
        matchIndex,
        leagueParticipantId: null,
        seedRank: null,
        seedRankA: null,
        seedRankB: null,
        winnerSlotKey,
        feederSlotAKey: feederA,
        feederSlotBKey: feederB,
        roundLabel: consolationRoundLabel(consolationSize, roundIndex),
      });
      const prevA = slots.find((s) => s.slotKey === feederA);
      const prevB = slots.find((s) => s.slotKey === feederB);
      if (prevA && prevA.slotKind === BracketSlotKind.CONSOLATION) {
        prevA.winnerSlotKey = `CONS-R${roundIndex}-M${matchIndex}`;
      }
      if (prevB && prevB.slotKind === BracketSlotKind.CONSOLATION) {
        prevB.winnerSlotKey = `CONS-R${roundIndex}-M${matchIndex}`;
      }
    }
  }
}

export interface BracketPlanGolden {
  entrantCount: number;
  bracketSize: number;
  byeCount: number;
  playInGames: number;
  slotCounts: {
    PLAY_IN: number;
    BYE: number;
    MAIN: number;
    THIRD_PLACE: number;
    CONSOLATION: number;
    LOSERS: number;
    GRAND_FINAL: number;
  };
  includeConsolationBracket: boolean;
  includeDoubleElimination: boolean;
  includeThirdPlace: boolean;
  slots: Array<{
    slotKey: string;
    slotKind: BracketSlotKind;
    phaseIndex: number;
    roundIndex: number;
    matchIndex: number;
    seedRank: number | null;
    seedRankA: number | null;
    seedRankB: number | null;
    winnerSlotKey: string | null;
    feederSlotAKey: string | null;
    feederSlotBKey: string | null;
    roundLabel: string;
    initialGame: boolean;
  }>;
}

export function bracketPlanToGolden(plan: BracketPlan): BracketPlanGolden {
  const slotCounts = {
    PLAY_IN: 0,
    BYE: 0,
    MAIN: 0,
    THIRD_PLACE: 0,
    CONSOLATION: 0,
    LOSERS: 0,
    GRAND_FINAL: 0,
  };
  for (const s of plan.slots) {
    slotCounts[s.slotKind]++;
  }
  const initialSet = new Set(plan.initialGameSlotKeys);
  return {
    entrantCount: plan.entrantCount,
    bracketSize: plan.bracketSize,
    byeCount: plan.byeCount,
    playInGames: plan.playInGames,
    includeThirdPlace: plan.includeThirdPlace,
    includeConsolationBracket: plan.includeConsolationBracket,
    includeDoubleElimination: plan.includeDoubleElimination,
    slotCounts,
    slots: plan.slots
      .map((s) => ({
        slotKey: s.slotKey,
        slotKind: s.slotKind,
        phaseIndex: s.phaseIndex,
        roundIndex: s.roundIndex,
        matchIndex: s.matchIndex,
        seedRank: s.seedRank,
        seedRankA: s.seedRankA,
        seedRankB: s.seedRankB,
        winnerSlotKey: s.winnerSlotKey,
        feederSlotAKey: s.feederSlotAKey,
        feederSlotBKey: s.feederSlotBKey,
        roundLabel: s.roundLabel,
        initialGame: initialSet.has(s.slotKey),
      }))
      .sort((a, b) => a.slotKey.localeCompare(b.slotKey)),
  };
}
