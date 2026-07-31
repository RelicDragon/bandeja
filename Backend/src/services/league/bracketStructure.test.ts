import * as fs from 'node:fs';
import * as path from 'node:path';
import { BracketSlotKind } from '@prisma/client';
import {
  buildBracketPlan,
  bracketPlanToGolden,
  playInPairings,
  validateByeSeedRanks,
  validateCustomPlayInPairings,
} from './bracketStructure';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const FIXTURE_NS = Array.from({ length: 15 }, (_, i) => i + 2);
const fixturesDir = path.join(__dirname, '__fixtures__');

for (const n of FIXTURE_NS) {
  const fixturePath = path.join(fixturesDir, `bracket-${n}.json`);
  const expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const plan = buildBracketPlan(n, ids);
  const golden = bracketPlanToGolden(plan);
  assert(deepEqual(golden, expected), `golden mismatch for N=${n}`);
  console.log(`ok: bracket-${n}.json`);
}

for (let n = 2; n <= 16; n++) {
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const playInGames = playInPairings(n, bracketSize).length;
  const plan = buildBracketPlan(n, Array.from({ length: n }, (_, i) => `p${i + 1}`));
  assert(playInGames === plan.playInGames, `playInPairings length for N=${n}`);
}

for (const n of [5, 7, 9]) {
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const plan = buildBracketPlan(n, ids);
  assert(plan.byeCount === Math.pow(2, Math.ceil(Math.log2(n))) - n, `byeCount N=${n}`);
  assert(plan.playInGames > 0, `expected play-ins N=${n}`);
}

const plan8 = buildBracketPlan(8, Array.from({ length: 8 }, (_, i) => `p${i + 1}`));
assert(plan8.initialGameSlotKeys.length === 4, 'N=8 creates 4 QF games at start');
assert(plan8.slots.filter((s) => s.slotKind === 'PLAY_IN').length === 0, 'N=8 no play-in');

const plan8Third = buildBracketPlan(8, Array.from({ length: 8 }, (_, i) => `p${i + 1}`), {
  includeThirdPlace: true,
});
assert(plan8Third.includeThirdPlace, 'N=8 third place flag');
const thirdSlot = plan8Third.slots.find((s) => s.slotKind === BracketSlotKind.THIRD_PLACE);
assert(thirdSlot?.slotKey === 'THIRD-M0', 'third place slot key');
assert(thirdSlot?.feederSlotAKey === 'MAIN-R1-M0', 'third fed by SF0');
assert(thirdSlot?.feederSlotBKey === 'MAIN-R1-M1', 'third fed by SF1');
assert(!plan8Third.initialGameSlotKeys.includes('THIRD-M0'), 'third place game is lazy');

const plan8Cons = buildBracketPlan(8, Array.from({ length: 8 }, (_, i) => `p${i + 1}`), {
  includeConsolationBracket: true,
});
assert(plan8Cons.includeConsolationBracket, 'N=8 consolation flag');
assert(
  plan8Cons.slots.filter((s) => s.slotKind === BracketSlotKind.CONSOLATION).length === 3,
  'N=8 consolation: 2 R0 + 1 final'
);
const consR0 = plan8Cons.slots.find((s) => s.slotKey === 'CONS-R0-M0');
assert(consR0?.feederSlotAKey === 'MAIN-R0-M0', 'consolation R0 fed by MAIN R0 losers');
assert(consR0?.feederSlotBKey === 'MAIN-R0-M1', 'consolation R0 pair');
assert(!plan8Cons.initialGameSlotKeys.some((k) => k.startsWith('CONS-')), 'consolation games lazy');

const plan2Cons = buildBracketPlan(2, ['p1', 'p2'], { includeConsolationBracket: true });
assert(!plan2Cons.includeConsolationBracket, 'N=2 cannot enable consolation');

const plan8De = buildBracketPlan(8, Array.from({ length: 8 }, (_, i) => `p${i + 1}`), {
  includeDoubleElimination: true,
});
assert(plan8De.includeDoubleElimination, 'N=8 double elim flag');
assert(
  plan8De.slots.filter((s) => s.slotKind === BracketSlotKind.LOSERS).length === 6,
  'N=8 double elim: complete six-game losers bracket'
);
assert(
  plan8De.slots.filter((s) => s.slotKind === BracketSlotKind.GRAND_FINAL).length === 2,
  'N=8 double elim: grand final and conditional reset slots'
);
const losR0 = plan8De.slots.find((s) => s.slotKey === 'LOS-R0-M0');
assert(losR0?.feederSlotAKey === 'MAIN-R0-M0', 'losers R0 fed by MAIN R0 losers');
assert(losR0?.feederSlotBKey === 'MAIN-R0-M1', 'losers R0 pair');
const losR1M0 = plan8De.slots.find((s) => s.slotKey === 'LOS-R1-M0');
assert(losR1M0?.feederSlotAKey === 'LOS-R0-M0', 'losers R1 keeps earlier survivor');
assert(losR1M0?.feederSlotBKey === 'MAIN-R1-M1', 'losers R1 receives crossed semifinal loser');
const losR2 = plan8De.slots.find((s) => s.slotKey === 'LOS-R2-M0');
assert(losR2?.feederSlotAKey === 'LOS-R1-M0', 'losers consolidation feeder A');
assert(losR2?.feederSlotBKey === 'LOS-R1-M1', 'losers consolidation feeder B');
const losersFinal = plan8De.slots.find((s) => s.slotKey === 'LOS-R3-M0');
assert(losersFinal?.feederSlotAKey === 'LOS-R2-M0', 'losers final keeps lower-bracket survivor');
assert(losersFinal?.feederSlotBKey === 'MAIN-R2-M0', 'losers final receives winners-final loser');
const mainFinal = plan8De.slots.find((s) => s.slotKey === 'MAIN-R2-M0');
assert(mainFinal?.winnerSlotKey === 'GRAND-FINAL-M0', 'main final feeds grand final');
const gf = plan8De.slots.find((s) => s.slotKey === 'GRAND-FINAL-M0');
assert(gf?.feederSlotAKey === 'MAIN-R2-M0', 'GF fed by winners final');
assert(gf?.feederSlotBKey === 'LOS-R3-M0', 'GF fed by losers champion');
assert(gf?.winnerSlotKey === 'GRAND-FINAL-M1', 'GF feeds conditional reset');
const reset = plan8De.slots.find((s) => s.slotKey === 'GRAND-FINAL-M1');
assert(reset?.feederSlotAKey === 'GRAND-FINAL-M0', 'reset waits for first grand final');
assert(reset?.feederSlotBKey === 'GRAND-FINAL-M0', 'reset reuses both grand-final contestants');
assert(!plan8De.initialGameSlotKeys.some((k) => k.startsWith('LOS-')), 'losers games lazy');
assert(!plan8De.initialGameSlotKeys.includes('GRAND-FINAL-M0'), 'grand final game lazy');

const plan2De = buildBracketPlan(2, ['p1', 'p2'], { includeDoubleElimination: true });
assert(!plan2De.includeDoubleElimination, 'N=2 cannot enable double elim');

for (let n = 4; n <= 16; n++) {
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const hasPlayIn = n < bracketSize;
  const mainSize = hasPlayIn ? bracketSize / 2 : bracketSize;
  const plan = buildBracketPlan(
    n,
    Array.from({ length: n }, (_, i) => `p${i + 1}`),
    { includeDoubleElimination: true }
  );
  if (mainSize < 4) continue;
  assert(plan.includeDoubleElimination, `N=${n} enables double elimination`);
  assert(
    plan.slots.filter((s) => s.slotKind === BracketSlotKind.LOSERS).length === mainSize - 2,
    `N=${n} losers bracket has mainSize-2 games`
  );
  assert(
    plan.slots.filter((s) => s.slotKind === BracketSlotKind.GRAND_FINAL).length === 2,
    `N=${n} has grand final and reset`
  );
  const slotKeys = new Set(plan.slots.map((s) => s.slotKey));
  const losersSlots = plan.slots.filter((s) => s.slotKind === BracketSlotKind.LOSERS);
  const mainLoserFeeders = losersSlots.flatMap((s) => [s.feederSlotAKey, s.feederSlotBKey]);
  for (const mainSlot of plan.slots.filter((s) => s.slotKind === BracketSlotKind.MAIN)) {
    assert(
      mainLoserFeeders.filter((key) => key === mainSlot.slotKey).length === 1,
      `N=${n} every winners-bracket loser enters the losers bracket exactly once`
    );
  }
  const missingFeeders = plan.slots
    .flatMap((s) => [s.feederSlotAKey, s.feederSlotBKey])
    .filter((key): key is string => Boolean(key))
    .filter((key) => !slotKeys.has(key));
  assert(missingFeeders.length === 0, `N=${n} double elimination has no dangling feeders`);
}

let mutualThrew = false;
try {
  buildBracketPlan(8, Array.from({ length: 8 }, (_, i) => `p${i + 1}`), {
    includeConsolationBracket: true,
    includeDoubleElimination: true,
  });
} catch {
  mutualThrew = true;
}
assert(mutualThrew, 'reject consolation + double elim together');

let thirdPlaceDoubleElimThrew = false;
try {
  buildBracketPlan(8, Array.from({ length: 8 }, (_, i) => `p${i + 1}`), {
    includeThirdPlace: true,
    includeDoubleElimination: true,
  });
} catch {
  thirdPlaceDoubleElimThrew = true;
}
assert(thirdPlaceDoubleElimThrew, 'reject third place + double elim together');

const plan7Bye = buildBracketPlan(7, Array.from({ length: 7 }, (_, i) => `p${i + 1}`), {
  byeSeedRanks: [3],
});
const byeRanks = plan7Bye.slots
  .filter((s) => s.slotKind === BracketSlotKind.BYE)
  .map((s) => s.seedRank)
  .sort((a, b) => (a ?? 0) - (b ?? 0));
assert(deepEqual(byeRanks, [3]), 'custom bye seed #3 only for N=7');
assert(plan7Bye.playInGames === 3, 'custom bye N=7 keeps 3 play-in games');
const plan7PlayInSeeds = plan7Bye.slots
  .filter((s) => s.slotKind === BracketSlotKind.PLAY_IN)
  .flatMap((s) => [s.seedRankA, s.seedRankB])
  .filter((s): s is number => s != null)
  .sort((a, b) => a - b);
assert(deepEqual(plan7PlayInSeeds, [1, 2, 4, 5, 6, 7]), 'custom bye N=7 covers all non-bye seeds');
const plan7MissingFeeders = plan7Bye.slots
  .filter((s) => s.slotKind === BracketSlotKind.MAIN && s.roundIndex === 0)
  .flatMap((s) => [s.feederSlotAKey, s.feederSlotBKey])
  .filter((key): key is string => Boolean(key))
  .filter((key) => !plan7Bye.slots.some((s) => s.slotKey === key));
assert(plan7MissingFeeders.length === 0, 'custom bye N=7 main feeders all exist');
const plan7AllMissingFeeders = plan7Bye.slots
  .flatMap((s) => [s.feederSlotAKey, s.feederSlotBKey])
  .filter((key): key is string => Boolean(key))
  .filter((key) => !plan7Bye.slots.some((s) => s.slotKey === key));
assert(plan7AllMissingFeeders.length === 0, 'custom bye N=7 has no dangling feeder');
assert(
  plan7Bye.slots.filter((s) => s.slotKind === BracketSlotKind.MAIN).length === 3,
  'custom bye N=7 has two semifinals and one final'
);

let threw = false;
try {
  validateByeSeedRanks([1, 2], 7, 1);
} catch {
  threw = true;
}
assert(threw, 'reject customByeSeedRanks wrong length');

const plan5CustomPi = buildBracketPlan(5, Array.from({ length: 5 }, (_, i) => `p${i + 1}`), {
  customPlayInPairings: [{ seedA: 4, seedB: 5 }],
});
const pi5 = plan5CustomPi.slots.find((s) => s.slotKind === BracketSlotKind.PLAY_IN);
assert(pi5?.seedRankA === 4 && pi5?.seedRankB === 5, 'custom play-in 4 vs 5 for N=5');

let piThrew = false;
try {
  validateCustomPlayInPairings([{ seedA: 4, seedB: 5 }, { seedA: 4, seedB: 6 }], 5, 8);
} catch {
  piThrew = true;
}
assert(piThrew, 'reject custom play-in that does not cover full pool');

console.log('ok: all bracket structure tests passed');
