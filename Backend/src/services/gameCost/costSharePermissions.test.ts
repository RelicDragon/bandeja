import assert from 'node:assert/strict';
import {
  canConfirmCostShare,
  canManageCostShares,
  canMarkOwnCostSharePaid,
  canRemindCostShares,
  canViewCostShares,
  type CostShareActorContext,
} from './costSharePermissions';

/**
 * PRD 348 — the full permission matrix, as a table.
 *
 * The cast: `owner` organises, `admin` co-organises, `payer` fronted the money,
 * `player` owes a share, `bench` is on the roster but has no share, `stranger`
 * is not involved at all, `staff` is platform support.
 */

const base: Omit<CostShareActorContext, 'userId' | 'isPlatformAdmin'> = {
  entityType: 'GAME',
  gameOwnerUserId: 'owner',
  gameAdminUserIds: ['admin'],
  payerUserId: 'payer',
  playingUserIds: ['payer', 'player'],
  shareUserIds: ['owner', 'admin', 'payer', 'player'],
};

function ctx(userId: string, isPlatformAdmin = false): CostShareActorContext {
  return { ...base, userId, isPlatformAdmin };
}

type Row = {
  actor: string;
  staff?: boolean;
  view: boolean;
  manage: boolean;
  markOwn: boolean;
  confirmPlayer: boolean;
  remind: boolean;
};

const matrix: Row[] = [
  { actor: 'owner', view: true, manage: true, markOwn: true, confirmPlayer: true, remind: true },
  { actor: 'admin', view: true, manage: true, markOwn: true, confirmPlayer: true, remind: true },
  { actor: 'payer', view: true, manage: false, markOwn: true, confirmPlayer: true, remind: true },
  { actor: 'player', view: true, manage: false, markOwn: true, confirmPlayer: false, remind: false },
  { actor: 'bench', view: false, manage: false, markOwn: false, confirmPlayer: false, remind: false },
  { actor: 'stranger', view: false, manage: false, markOwn: false, confirmPlayer: false, remind: false },
  { actor: 'staff', staff: true, view: true, manage: true, markOwn: false, confirmPlayer: true, remind: true },
];

for (const row of matrix) {
  const actor = ctx(row.actor, row.staff ?? false);
  assert.equal(canViewCostShares(actor), row.view, `${row.actor} view`);
  assert.equal(canManageCostShares(actor), row.manage, `${row.actor} manage`);
  assert.equal(canMarkOwnCostSharePaid(actor), row.markOwn, `${row.actor} mark own paid`);
  assert.equal(
    canConfirmCostShare(actor, 'player'),
    row.confirmPlayer,
    `${row.actor} confirm player`,
  );
  assert.equal(canRemindCostShares(actor), row.remind, `${row.actor} remind`);
}

// A player can never confirm their own share — "Received" is the payer's word.
assert.equal(canConfirmCostShare(ctx('player'), 'player'), false);

// Nobody can confirm a share that does not exist.
assert.equal(canConfirmCostShare(ctx('owner'), 'stranger'), false);
assert.equal(canConfirmCostShare(ctx('owner'), 'bench'), false);

// A game with no payer set yet: organizers still run the ledger.
{
  const noPayer: CostShareActorContext = { ...ctx('owner'), payerUserId: null };
  assert.equal(canRemindCostShares(noPayer), true);
  assert.equal(canConfirmCostShare({ ...ctx('payer'), payerUserId: null }, 'player'), false);
}

// A historical share never grants access after leaving the playing roster.
{
  const leaver: CostShareActorContext = {
    ...ctx('ghost'),
    playingUserIds: ['owner'],
    shareUserIds: ['ghost'],
  };
  assert.equal(canViewCostShares(leaver), false);
  assert.equal(canMarkOwnCostSharePaid(leaver), false);
  assert.equal(canManageCostShares(leaver), false);
}


for (const row of matrix) {
  const actor = ctx(row.actor, row.staff ?? false);
  assert.equal(canViewCostShares({ ...actor, entityType: 'LEAGUE' }), row.view);
  const season = { ...actor, entityType: 'LEAGUE_SEASON' };
  assert.equal(canViewCostShares(season), false);
  assert.equal(canManageCostShares(season), false);
  assert.equal(canMarkOwnCostSharePaid(season), false);
  assert.equal(canConfirmCostShare(season, 'player'), false);
  assert.equal(canRemindCostShares(season), false);
}
const nonPlayingPayer = { ...ctx('payer'), playingUserIds: [] };
assert.equal(canViewCostShares(nonPlayingPayer), false);
assert.equal(canRemindCostShares(nonPlayingPayer), false);

console.log('costSharePermissions.test.ts: ok');
