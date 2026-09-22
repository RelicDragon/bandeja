import assert from 'node:assert/strict';
import { projectCostSummary } from './costSummaryProjection';
import type { CostShareActorContext } from './costSharePermissions';
import type { CostShareDto, GameCostSummaryDto } from './gameCost.types';

const shares: CostShareDto[] = ['a', 'b', 'c', 'd'].map((userId, index) => ({
  userId, user: null, amountMinor: 1000, currency: 'EUR',
  state: index < 2 ? 'SETTLED' : 'UNPAID',
  markedPaidAt: null, confirmedAt: null, method: 'MANUAL', transactionId: null,
  isPayer: false, isOverridden: false,
}));
const summary: GameCostSummaryDto = {
  gameId: 'game', available: true, totalMinor: 4000, currency: 'EUR',
  payerUserId: 'owner', payer: null, paymentHint: null, paymentMethods: [],
  countryIso2: null, frozenAt: null, estimated: true, shares,
  settledCount: 2, shareCount: 4, outstandingMinor: 2000, viewerShare: shares[2],
  canManage: false, canConfirm: false, canRemind: false, coinsPerCurrencyUnit: null,
  viewerCoinCost: null, viewerCoinBalance: 0, remindAvailableAt: null,
};
const ctx: CostShareActorContext = {
  entityType: 'GAME', userId: 'c', isPlatformAdmin: false,
  gameOwnerUserId: 'owner', gameAdminUserIds: [], payerUserId: 'owner',
  playingUserIds: ['a', 'b', 'c', 'd'], shareUserIds: ['a', 'b', 'c', 'd'],
};

const player = projectCostSummary(summary, ctx);
assert.deepEqual(player.shares, [shares[2]], 'ordinary players receive only their own row');
assert.equal(player.viewerShare, shares[2]);
assert.equal(player.totalMinor, null, 'no full price in the response');
assert.equal(player.outstandingMinor, null, 'no outstanding money in the response');
assert.equal(player.settledCount, 2);
assert.equal(player.shareCount, 4, 'counts include all players, not just the visible row');

for (const permissions of [
  { canManage: true, canConfirm: true }, // owner, game admin, platform admin
  { canManage: false, canConfirm: true }, // playing payer
]) {
  const organizer = projectCostSummary({ ...summary, ...permissions }, ctx);
  assert.deepEqual(organizer.shares, shares);
  assert.equal(organizer.totalMinor, 4000);
  assert.equal(organizer.outstandingMinor, 2000);
}

const noShare = projectCostSummary(summary, { ...ctx, userId: 'new-player' });
assert.deepEqual(noShare.shares, []);
assert.equal(noShare.viewerShare, null);
assert.equal(noShare.shareCount, 4, 'an eligible viewer without a share can still see counts');

const legacyPayer: CostShareDto = { ...shares[0], userId: 'owner', isPayer: true };
const frozen = {
  ...summary, frozenAt: '2026-09-22T00:00:00Z', estimated: false,
  shares: [legacyPayer, ...shares], totalMinor: 5000, shareCount: 5, settledCount: 3,
  canManage: true, canConfirm: true,
};
const legacy = projectCostSummary(frozen, { ...ctx, userId: 'owner' });
assert.deepEqual(legacy.shares, shares, 'no extra paid-the-club row in a frozen legacy ledger');
assert.equal(legacy.shareCount, 4);
assert.equal(legacy.settledCount, 2);
assert.equal(legacy.viewerShare, null);
assert.equal(frozen.shares.length, 5, 'projection never rewrites frozen amounts');

const playingPayer = projectCostSummary({
  ...summary, shares: [{ ...shares[0], isPayer: true }, ...shares.slice(1)],
  canConfirm: true,
}, { ...ctx, payerUserId: 'a', userId: 'a' });
assert.equal(playingPayer.shareCount, 4, 'a playing payer keeps their ordinary player row');
assert.equal(playingPayer.shares[0].userId, 'a');
assert.equal(playingPayer.settledCount, 2);

console.log('costSummaryProjection.test.ts: ok');
