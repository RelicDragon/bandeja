import assert from 'node:assert/strict';
import type { PriceCurrency } from '@prisma/client';
import {
  buildCoinTransferLabel,
  coinsForShare,
  currencyMinorFactor,
  planCoinSettlement,
  detectOverriddenUserIds,
  isCostSplitPriceType,
  perHeadAmountMinor,
  recomputeShares,
  resolveGameTotalMinor,
  splitCostShares,
  deriveShareState,
  selectSplitParticipantIds,
  resolvePerHeadPayerCount,
  type CostShareSplitRow,
} from './costShareMath';
import { formatCostAmount } from './costReminderCopy';

/**
 * PRD 348 — the part most likely to be subtly wrong: the money.
 *
 * Everything asserted here is a pure function, so there is no database, no
 * clock and no network. Table-driven where a table reads better than prose.
 */

const EUR = 'EUR' as PriceCurrency;
const JPY = 'JPY' as PriceCurrency;
const KWD = 'KWD' as PriceCurrency;

function amounts(rows: CostShareSplitRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.userId, row.amountMinor]));
}

function sum(rows: CostShareSplitRow[]): number {
  return rows.reduce((total, row) => total + row.amountMinor, 0);
}

// ---------------------------------------------------------------------------
// currency minor units
// ---------------------------------------------------------------------------

assert.equal(currencyMinorFactor(EUR), 100);
assert.equal(currencyMinorFactor(JPY), 1, 'yen has no minor unit');
assert.equal(currencyMinorFactor(KWD), 1000, 'dinar has three');

// ---------------------------------------------------------------------------
// what counts as a splittable price
// ---------------------------------------------------------------------------

assert.equal(isCostSplitPriceType('TOTAL'), true);
assert.equal(isCostSplitPriceType('PER_PERSON'), true);
assert.equal(isCostSplitPriceType('PER_TEAM'), false, 'team count is unknown');
assert.equal(isCostSplitPriceType('NOT_KNOWN'), false);
assert.equal(isCostSplitPriceType('FREE'), false);
assert.equal(isCostSplitPriceType(null), false);

const totalCases: {
  name: string;
  input: Parameters<typeof resolveGameTotalMinor>[0];
  expected: number | null;
}[] = [
  {
    name: '40 EUR total',
    input: { priceType: 'TOTAL', priceTotal: 40, currency: EUR, payerCount: 4 },
    expected: 4000,
  },
  {
    name: '10 EUR per person × 4',
    input: { priceType: 'PER_PERSON', priceTotal: 10, currency: EUR, payerCount: 4 },
    expected: 4000,
  },
  {
    name: '4000 JPY total has no cents',
    input: { priceType: 'TOTAL', priceTotal: 4000, currency: JPY, payerCount: 4 },
    expected: 4000,
  },
  {
    name: 'free game',
    input: { priceType: 'FREE', priceTotal: 0, currency: EUR, payerCount: 4 },
    expected: null,
  },
  {
    name: 'zero total hides the card',
    input: { priceType: 'TOTAL', priceTotal: 0, currency: EUR, payerCount: 4 },
    expected: null,
  },
  {
    name: 'no currency hides the card',
    input: { priceType: 'TOTAL', priceTotal: 40, currency: null, payerCount: 4 },
    expected: null,
  },
  {
    name: 'empty roster',
    input: { priceType: 'TOTAL', priceTotal: 40, currency: EUR, payerCount: 0 },
    expected: null,
  },
  {
    name: 'float cents round once, at the boundary',
    input: { priceType: 'TOTAL', priceTotal: 33.335, currency: EUR, payerCount: 3 },
    expected: 3334,
  },
];

for (const testCase of totalCases) {
  assert.equal(resolveGameTotalMinor(testCase.input), testCase.expected, testCase.name);
}

// ---------------------------------------------------------------------------
// the even split, and where the remainder lands
// ---------------------------------------------------------------------------

{
  const rows = splitCostShares({
    totalMinor: 4000,
    participantIds: ['a', 'b', 'c', 'd'],
    payerId: 'a',
  });
  assert.deepEqual(amounts(rows), { a: 1000, b: 1000, c: 1000, d: 1000 });
  assert.equal(sum(rows), 4000);
}

{
  // 10.00 / 3 = 3.33 each, 1 cent over. The payer eats it.
  const rows = splitCostShares({
    totalMinor: 1000,
    participantIds: ['a', 'b', 'c'],
    payerId: 'b',
  });
  assert.deepEqual(amounts(rows), { a: 333, b: 334, c: 333 });
  assert.equal(sum(rows), 1000, 'the split always sums to the total');
}

{
  // No payer at all: the first participant in the given order takes it, so the
  // result is still deterministic.
  const rows = splitCostShares({
    totalMinor: 1000,
    participantIds: ['a', 'b', 'c'],
    payerId: null,
  });
  assert.deepEqual(amounts(rows), { a: 334, b: 333, c: 333 });
}

{
  // A payer who is not in the split cannot take the remainder.
  const rows = splitCostShares({
    totalMinor: 1000,
    participantIds: ['a', 'b', 'c'],
    payerId: 'z',
  });
  assert.equal(sum(rows), 1000);
  assert.equal(rows[0].amountMinor, 334);
}

{
  // Two cents over, one payer.
  const rows = splitCostShares({
    totalMinor: 1001,
    participantIds: ['a', 'b', 'c'],
    payerId: 'c',
  });
  assert.deepEqual(amounts(rows), { a: 333, b: 333, c: 335 });
}

{
  const rows = splitCostShares({ totalMinor: 4000, participantIds: [], payerId: 'a' });
  assert.deepEqual(rows, [], 'nobody to split between');
}

{
  const rows = splitCostShares({
    totalMinor: 4000,
    participantIds: ['a', 'a', 'b'],
    payerId: 'a',
  });
  assert.equal(rows.length, 2, 'a duplicated id is one payer');
}

// ---------------------------------------------------------------------------
// organizer overrides
// ---------------------------------------------------------------------------

{
  // A guest pays 5 €; the other three absorb the remaining 35 €.
  const rows = splitCostShares({
    totalMinor: 4000,
    participantIds: ['a', 'b', 'c', 'd'],
    payerId: 'a',
    overrides: { d: 500 },
  });
  // 3500 / 3 = 1166 each with 2 cents over; PRD 348 sends the remainder to the
  // payer, so `a` carries both cents.
  assert.deepEqual(amounts(rows), { a: 1168, b: 1166, c: 1166, d: 500 });
  assert.equal(sum(rows), 4000, 'the group still pays exactly the total');
  assert.equal(rows.find((row) => row.userId === 'd')?.overridden, true);
  assert.equal(rows.find((row) => row.userId === 'a')?.overridden, false);
}

{
  // "Split remainder evenly" off: the untouched players keep the plain even
  // split, so the group's sum deliberately drifts below the total.
  const rows = splitCostShares({
    totalMinor: 4000,
    participantIds: ['a', 'b', 'c', 'd'],
    payerId: 'a',
    overrides: { d: 500 },
    splitRemainderEvenly: false,
  });
  assert.deepEqual(amounts(rows), { a: 1000, b: 1000, c: 1000, d: 500 });
  assert.equal(sum(rows), 3500);
}

{
  // Everybody overridden: the amounts are taken verbatim.
  const rows = splitCostShares({
    totalMinor: 4000,
    participantIds: ['a', 'b'],
    payerId: 'a',
    overrides: { a: 3000, b: 1000 },
  });
  assert.deepEqual(amounts(rows), { a: 3000, b: 1000 });
}

{
  // A negative override is clamped, never negative money.
  const rows = splitCostShares({
    totalMinor: 1000,
    participantIds: ['a', 'b'],
    payerId: 'a',
    overrides: { b: -50 },
  });
  assert.deepEqual(amounts(rows), { a: 1000, b: 0 });
}

{
  // An override larger than the total leaves the rest at zero, never negative.
  const rows = splitCostShares({
    totalMinor: 1000,
    participantIds: ['a', 'b'],
    payerId: 'a',
    overrides: { b: 5000 },
  });
  assert.deepEqual(amounts(rows), { a: 0, b: 5000 });
}

// ---------------------------------------------------------------------------
// override detection across a roster change
// ---------------------------------------------------------------------------

{
  // The stored shape produced by `splitCostShares(4000, [a,b,c,d], payer a,
  // { d: 500 })`: only `d` was set by hand, the rest is the even split of what
  // was left with the remainder on the payer.
  const rows = [
    { userId: 'a', amountMinor: 1168 },
    { userId: 'b', amountMinor: 1166 },
    { userId: 'c', amountMinor: 1166 },
    { userId: 'd', amountMinor: 500 },
  ];
  assert.deepEqual(detectOverriddenUserIds(rows, 'a'), ['d']);
}

{
  // Two overrides in the same game are both recovered.
  const rows = [
    { userId: 'a', amountMinor: 1750 },
    { userId: 'b', amountMinor: 1750 },
    { userId: 'c', amountMinor: 200 },
    { userId: 'd', amountMinor: 300 },
  ];
  assert.deepEqual(detectOverriddenUserIds(rows, 'a'), ['c', 'd']);
}

assert.deepEqual(detectOverriddenUserIds([], 'a'), []);

{
  const even = [
    { userId: 'a', amountMinor: 1000 },
    { userId: 'b', amountMinor: 1000 },
  ];
  assert.deepEqual(detectOverriddenUserIds(even, 'a'), [], 'an even split has no overrides');
}

// ---------------------------------------------------------------------------
// recompute: join, leave, substitution, coin pins
// ---------------------------------------------------------------------------

{
  // Someone joins: 40 € over 4 instead of 3.
  const rows = recomputeShares({
    totalMinor: 4000,
    participantIds: ['a', 'b', 'c', 'd'],
    payerId: 'a',
    existing: [
      { userId: 'a', amountMinor: 1334 },
      { userId: 'b', amountMinor: 1333 },
      { userId: 'c', amountMinor: 1333 },
    ],
  });
  assert.deepEqual(amounts(rows), { a: 1000, b: 1000, c: 1000, d: 1000 });
}

{
  // Someone leaves before the game: they drop out of the split entirely.
  const rows = recomputeShares({
    totalMinor: 4000,
    participantIds: ['a', 'b', 'c'],
    payerId: 'a',
    existing: [
      { userId: 'a', amountMinor: 1000 },
      { userId: 'b', amountMinor: 1000 },
      { userId: 'c', amountMinor: 1000 },
      { userId: 'd', amountMinor: 1000 },
    ],
  });
  assert.deepEqual(amounts(rows), { a: 1334, b: 1333, c: 1333 });
  assert.equal(rows.some((row) => row.userId === 'd'), false, 'the leaver has no share');
}

{
  // An organizer override survives a roster change.
  const rows = recomputeShares({
    totalMinor: 4500,
    participantIds: ['a', 'b', 'c', 'd', 'e'],
    payerId: 'a',
    existing: [
      { userId: 'a', amountMinor: 1168 },
      { userId: 'b', amountMinor: 1166 },
      { userId: 'c', amountMinor: 1166 },
      { userId: 'd', amountMinor: 500 },
    ],
  });
  assert.equal(amounts(rows).d, 500, 'the guest keeps their agreed amount');
  assert.deepEqual(
    amounts(rows),
    { a: 1000, b: 1000, c: 1000, d: 500, e: 1000 },
    'only the guest is treated as overridden — everyone else re-splits',
  );
  assert.equal(sum(rows), 4500);
}

{
  // A share already settled in coins is pinned: that money has moved.
  const rows = recomputeShares({
    totalMinor: 4000,
    participantIds: ['a', 'b', 'c', 'd'],
    payerId: 'a',
    existing: [
      { userId: 'a', amountMinor: 1334 },
      { userId: 'b', amountMinor: 1333 },
      { userId: 'c', amountMinor: 1333 },
    ],
    pinnedUserIds: ['b'],
  });
  assert.equal(amounts(rows).b, 1333, 'a paid share never moves');
  assert.equal(sum(rows), 4000);
}

// ---------------------------------------------------------------------------
// per-head figure and the card's payer count
// ---------------------------------------------------------------------------

assert.equal(perHeadAmountMinor(4000, 4), 1000);
assert.equal(perHeadAmountMinor(1000, 3), 333);
assert.equal(perHeadAmountMinor(0, 4), null);
assert.equal(perHeadAmountMinor(4000, 0), null);

assert.equal(
  resolvePerHeadPayerCount({ playingCount: 1, maxParticipants: 4, shareCount: 1, frozen: false }),
  4,
  'before the game the card answers "what will this cost me if I join?"',
);
assert.equal(
  resolvePerHeadPayerCount({ playingCount: 6, maxParticipants: 4, shareCount: 6, frozen: false }),
  6,
  'an over-full roster still splits by the people in it',
);
assert.equal(
  resolvePerHeadPayerCount({ playingCount: 4, maxParticipants: 4, shareCount: 3, frozen: true }),
  3,
  'once frozen only the real shares count',
);
assert.equal(
  resolvePerHeadPayerCount({ playingCount: 0, maxParticipants: 0, shareCount: 0, frozen: false }),
  1,
  'never divides by zero',
);

// ---------------------------------------------------------------------------
// coin conversion — unset rate hides the option
// ---------------------------------------------------------------------------

assert.equal(coinsForShare(1000, EUR, null), null, 'COINS_PER_CURRENCY_UNIT unset');
assert.equal(coinsForShare(1000, EUR, 0), null);
assert.equal(coinsForShare(1000, EUR, -5), null);
assert.equal(coinsForShare(0, EUR, 100), null);
assert.equal(coinsForShare(1000, EUR, 100), 1000, '10 € at 100 coins/€');
assert.equal(coinsForShare(1050, EUR, 1), 11, 'rounds up so the payer is never short');
assert.equal(coinsForShare(500, JPY, 1), 500, 'yen has no minor unit');

// ---------------------------------------------------------------------------
// the coin settle path — every refusal, before any money moves
// ---------------------------------------------------------------------------

const settleBase = {
  viewerId: 'me',
  payerId: 'marko' as string | null,
  amountMinor: 1000,
  currency: EUR,
  coinsPerCurrencyUnit: 100 as number | null,
  viewerCoinBalance: 5000,
  alreadySettled: false,
};

{
  const plan = planCoinSettlement(settleBase);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan, { ok: true, coins: 1000, payerId: 'marko' });
}

const refusals: { name: string; patch: Partial<typeof settleBase>; reason: string }[] = [
  {
    name: 'the platform rate is unset, so coins are hidden everywhere',
    patch: { coinsPerCurrencyUnit: null },
    reason: 'COINS_UNAVAILABLE',
  },
  {
    name: 'a zero rate is not a rate',
    patch: { coinsPerCurrencyUnit: 0 },
    reason: 'COINS_UNAVAILABLE',
  },
  {
    name: 'the share is already settled — never mark it twice',
    patch: { alreadySettled: true },
    reason: 'ALREADY_SETTLED',
  },
  {
    name: 'nobody to send the coins to',
    patch: { payerId: null },
    reason: 'NO_PAYER',
  },
  {
    name: 'the payer cannot pay themselves',
    patch: { payerId: 'me' },
    reason: 'PAYER_CANNOT_PAY_SELF',
  },
  {
    name: 'not enough coins',
    patch: { viewerCoinBalance: 999 },
    reason: 'INSUFFICIENT_COINS',
  },
];

for (const refusal of refusals) {
  const plan = planCoinSettlement({ ...settleBase, ...refusal.patch });
  assert.equal(plan.ok, false, refusal.name);
  assert.equal(plan.ok === false && plan.reason, refusal.reason, refusal.name);
}

{
  // Exactly enough coins is enough.
  const plan = planCoinSettlement({ ...settleBase, viewerCoinBalance: 1000 });
  assert.equal(plan.ok, true);
}

{
  // "Already settled" is checked before anything else, so a stale retry after a
  // successful transfer is refused rather than transferring again.
  const plan = planCoinSettlement({
    ...settleBase,
    alreadySettled: true,
    viewerCoinBalance: 0,
    coinsPerCurrencyUnit: null,
  });
  assert.equal(plan.ok === false && plan.reason, 'ALREADY_SETTLED');
}

assert.equal(buildCoinTransferLabel('Tuesday padel'), 'Game share · Tuesday padel');
assert.equal(buildCoinTransferLabel(null), 'Game share');
assert.equal(buildCoinTransferLabel('   '), 'Game share');

// ---------------------------------------------------------------------------
// who is in the split
// ---------------------------------------------------------------------------

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));

{
  const roster = [
    { userId: 'owner', status: 'PLAYING', joinedAt: at(0) },
    { userId: 'b', status: 'PLAYING', joinedAt: at(1) },
    { userId: 'queued', status: 'IN_QUEUE', joinedAt: at(2) },
    { userId: 'invited', status: 'INVITED', joinedAt: at(3) },
  ];
  assert.deepEqual(
    selectSplitParticipantIds(roster, 'owner'),
    ['owner', 'b'],
    'only PLAYING seats pay',
  );
}

{
  // A non-playing organizer is excluded — unless they are the payer.
  const roster = [
    { userId: 'organizer', status: 'NON_PLAYING', joinedAt: at(0) },
    { userId: 'b', status: 'PLAYING', joinedAt: at(1) },
  ];
  assert.deepEqual(selectSplitParticipantIds(roster, 'b'), ['b']);
  assert.deepEqual(selectSplitParticipantIds(roster, 'organizer'), ['organizer', 'b']);
}

{
  // Join order decides the remainder holder when nobody paid.
  const roster = [
    { userId: 'late', status: 'PLAYING', joinedAt: at(9) },
    { userId: 'early', status: 'PLAYING', joinedAt: at(1) },
  ];
  assert.deepEqual(selectSplitParticipantIds(roster, null), ['early', 'late']);
}

// ---------------------------------------------------------------------------
// chip state
// ---------------------------------------------------------------------------

assert.equal(deriveShareState({ markedPaidAt: null, confirmedAt: null }, false), 'UNPAID');
assert.equal(deriveShareState({ markedPaidAt: at(0), confirmedAt: null }, false), 'MARKED_PAID');
assert.equal(deriveShareState({ markedPaidAt: at(0), confirmedAt: at(1) }, false), 'SETTLED');
assert.equal(
  deriveShareState({ markedPaidAt: null, confirmedAt: null }, true),
  'SETTLED',
  'the payer fronted the money, so their own row is settled by definition',
);

// ---------------------------------------------------------------------------
// money is never hand-formatted
// ---------------------------------------------------------------------------

assert.match(formatCostAmount(1000, EUR, 'en'), /10/);
assert.match(formatCostAmount(1000, EUR, 'en'), /€/);
assert.equal(
  formatCostAmount(4000, JPY, 'ja').includes('.'),
  false,
  'yen amounts carry no decimals',
);

console.log('costShareMath.test.ts: ok');
