# Fix: money paths (PRD 348 cost split, PRD 355 shop)

Scope: every finding in `critic-security.md` / `critic-conformance-351-357.md` that touches
`gameCost`, `shop`, coins or transactions. Nothing was executed — no build, test, lint, Prisma
generate or migration was run (the orchestrator owns heavy commands).

---

## Composition decision around `TransactionService`

`TransactionService.createTransaction` opens its own `prisma.$transaction`, so it can neither be
nested inside a caller's transaction nor be trusted to authorise a debit: it reads
`fromUser.wallet` **outside** that transaction (`transaction.service.ts:99-114`) and then issues an
unconditional `decrement`. Two concurrent spends by the same user therefore both pass and the wallet
goes negative. That behaviour is shared with bets, the marketplace and admin grants, and the brief
forbids changing it.

**Chosen composition:** `createTransaction` is untouched. A new narrowly-scoped export,
`createGuardedTransfer` (`Backend/src/services/transaction.service.ts`), performs a P2P `TRANSFER`
where the balance check *is* the debit — a conditional `UPDATE … WHERE wallet >= total` inside the
same transaction as the ledger rows and the credit. It is the only new caller-facing surface, used
by exactly one call site (`markOwnShareAsPaid`). It produces the same `Transaction` shape as
`createTransaction` (negated total, `TransactionRow` per line, both wallet-update socket emits, both
`sendTransactionNotification` calls), so wallet history and notifications are unchanged for the
player.

Two details that matter:

- the two wallet writes are ordered by user id, so two people paying each other at the same instant
  cannot deadlock;
- after the transaction commits, **nothing may throw** — the socket emit and the two notifications
  are wrapped, because the caller treats a throw as "no money moved" and releases its claim.

`shopPurchase.service.ts` keeps its hand-rolled PURCHASE/REFUND rows (it has to: the ledger rows
must commit with the `UserGoods` insert), and now applies the same conditional-decrement rule.

---

## Defect 1 — BLOCKER: cost-share coin settlement double-paid

**Where:** `Backend/src/services/gameCost/gameCost.service.ts` (`markOwnShareAsPaid`, COINS branch).

**The exact sequence that duplicated money**

1. Player with a €2 (200-coin) share and 1000 coins double-taps "Pay with coins" (or the client
   retries; the route allows 60/min).
2. Both requests run `requireLedger` → both read the share as `confirmedAt: null,
   transactionId: null` and the wallet as 1000, **outside any transaction**.
3. Both pass `planCoinSettlement` and both call `TransactionService.createTransaction(TRANSFER,
   200)`. The payer is credited **400** for a **200** share; the player is debited 400.
4. Both then `update` the share. The second write overwrites `transactionId`, so the first
   `Transaction` is orphaned: the ledger shows one settled share and 200 unrecoverable coins.

**The fix**

- The share row is **claimed first** with a conditional write:
  `updateMany({ where: { gameId, userId, confirmedAt: null, transactionId: null }, data: {
  markedPaidAt, confirmedAt, method: 'COINS' } })`. At READ COMMITTED the loser of the race blocks on
  that row lock, re-evaluates the predicate against the committed row, matches nothing and gets
  `count === 0` → `errors.cost.alreadySettled`. **The loser never reaches the transfer**, so no money
  moves for it.
- Only the winner calls `createGuardedTransfer`, so the debit cannot overdraw even if the same player
  settles two different shares at the same instant.
- If the transfer throws, the claim is released back to exactly its previous values
  (`markedPaidAt: share.markedPaidAt`, `confirmedAt: null`, `method: share.method`), scoped to
  `confirmedAt: claimedAt` so it can never clear somebody else's settlement. The share stays
  settleable.
- The winner then stamps `transactionId` under the same claim predicate.

**Why it is now safe:** exactly one request per share can hold the claim; money only moves for the
claim holder; a failed transfer is a full logical rollback; a retry after success is refused by the
same predicate. The coin amount is derived server-side from `GameCostShare.amountCents` and the
`COINS_PER_CURRENCY_UNIT` platform setting — never from the request body.

The `MANUAL` branch was made conditional too (`updateMany … markedPaidAt: null`), so a double tap
writes one timestamp and emits one socket update instead of two.

---

## Defect 2 — BLOCKER: shop wallet overdraft (N items for the price of one)

**Where:** `Backend/src/services/shop/shopPurchase.service.ts` (`purchaseGoods`, buy **and** gift).

**The exact sequence that lost money**

1. User has 100 coins and fires 5 concurrent `POST /api/shop/purchase` for 5 **different** 100-coin
   items (limiter allows 20/min).
2. The balance check was inside `prisma.$transaction`, but with no `isolationLevel` — Postgres READ
   COMMITTED. Each transaction reads the pre-decrement `wallet: 100` and passes
   `rejectPurchase`'s `buyerBalance < price`.
3. The `UserGoods` unique index only serialises purchases of the **same** item, so all five inserts
   succeed and all five `decrement: 100` apply on top of each other.
4. Result: 5 items owned, `wallet = -400`, bank credited 500 coins that never existed.

**The fix**

The authoritative gate is no longer a read. The debit is a conditional update inside the same
transaction:

```ts
const debited = await tx.user.updateMany({
  where: { id: buyer.id, wallet: { gte: item.price } },
  data: { wallet: { decrement: item.price } },
});
if (debited.count !== 1) throw shopRejectionError('INSUFFICIENT_FUNDS', { … });
```

A concurrent purchase of a different item blocks on the buyer's row, then re-evaluates
`wallet >= price` against the committed value and is refused with the normal 400
`shop.insufficientCoins` (with a freshly re-read `balance`/`shortfall`, so the client message is
accurate). `rejectPurchase`'s balance branch survives only to produce the friendly message on the
uncontended path.

**Why this and not `Serializable`:** the house `runSerializableCreate` pattern
(`game/create.service.ts:54-68`) with `P2034` retries was the alternative. A conditional decrement is
strictly narrower — it needs no retry loop, cannot abort an innocent concurrent purchase by a
*different* buyer, and serialises exactly the one row that must be serialised (the wallet). Every
purchase now takes the buyer lock before the bank lock, so the ordering is uniform and cannot
deadlock.

**The gift path is the same function** — the debit is always against `input.buyerUserId`, so the
guard holds for gifts as well. Prices are read from the `Goods` row inside the transaction; the
client never supplies an amount.

---

## Defect 3 — MAJOR: coins lost on a second withdrawal

**Where:** `Backend/src/services/shop/shopPurchase.service.ts` (`refundGoodsOwners`).

**The exact sequence that lost money**

1. Player buys item X for 120 coins.
2. Admin → Goods → Withdraw: refund paid, `UserGoods` row deleted, `isActive = false`.
3. Admin re-activates X.
4. Player buys X again — another 120 coins.
5. Admin withdraws again. The idempotency key was "does this user hold **any** `REFUND`
   `TransactionRow` for this goodsId" — a *lifetime* check — so `alreadyRefunded > 0`. But
   `tx.userGoods.delete` ran **before** that check gated the payout: ownership was destroyed and no
   refund was issued. Net: paid 240, refunded 120, owns nothing; the admin UI reported the owner as
   "skipped".

**The fix**

Idempotency is now **per ownership instance**, and the claim is the ownership row itself:

```ts
const claimed = await tx.userGoods.deleteMany({ where: { id: owner.id } });
if (claimed.count !== 1) return false;   // somebody else's withdraw already took this row
if (refundPerOwner <= 0) return false;   // free item: nothing to pay back
await tx.transaction.create({ … REFUND … });
await tx.user.update({ … increment … });
```

The lifetime `transactionRow.count` check is gone entirely.

**Why it is now safe:**

- *Never twice*: a `UserGoods` row can be deleted exactly once. `deleteMany` (not `delete`) means the
  loser of a concurrent withdraw gets `count === 0` instead of a thrown `P2025`, and Postgres
  re-evaluates the predicate after the row lock is released, so only one transaction reaches the
  payout.
- *Never zero*: the delete and the payout are in one transaction, so ownership is destroyed **only**
  when the refund lands; a failed payout rolls the ownership back and the row is refunded on the next
  run.
- Each new purchase creates a new ownership row, which earns its own refund. A withdraw → reactivate
  → re-buy → withdraw cycle now pays twice, once per instance.

Additionally, the owner list is re-read for a bounded second pass (`REFUND_PASSES = 2`): a purchase
that committed just as the admin deactivated the item used to keep the coins *and* lose the item.
Every pass deletes the rows it saw, so the set strictly shrinks and the loop always terminates.

---

## Also fixed (in-scope findings from the same audits)

| Finding | Where | Fix |
|---|---|---|
| [MINOR] `requireLedger` mutates before it authorizes — a stranger's 403 still wrote share rows, stamped `Game.costPayerId` and emitted into the game room | `gameCost.service.ts` | `requireLedger` now loads the game + existing share ids, builds the actor context and runs `canViewCostShares` **before** `syncGameCostShares`. The post-sync check is kept as a second belt. |
| [MINOR] Cost-share override amount unbounded (`1e15` → Prisma throws → 500; anything under 2^31 stored as a real share) | `gameCost.service.ts` | New `COST_SHARE_MAX_AMOUNT_MINOR = 100_000_000`; an override above it is a 400 `errors.cost.invalidAmount`. |
| [MINOR] Gifting bypasses the block relationship (blocked user gifts their target and the push carries their name) | `shopPurchase.service.ts` | `purchaseGoods` consults `isBlocked(buyer, recipient)` (bidirectional) on the gift path and answers 404 `shop.recipientNotFound` — refusing without confirming the block to the sender. Enforced in the service, so every caller is covered. |
| [MAJOR] The automatic cost-share reminder sweep starves past 50 in-window games | `costShareReminder.service.ts` | The `due` query is now keyset-paged by id with `AUTO_REMIND_MAX_PAGES = 10`, and the batch counts **reminders sent**, not rows scanned. Already-claimed games are paged past instead of occupying the batch for six days. |
| Post-commit delivery could turn settled money into an error | `transaction.service.ts`, `shopPurchase.service.ts` | Socket emits (and the transfer's notifications) are wrapped after commit, so a socket/push hiccup can never surface as a failed purchase/transfer that the client retries — and can never trigger a claim release after money moved. |

---

## Deliberately **not** touched (flagging for the orchestrator)

- **[MAJOR] `Game.paymentHint` served unauthenticated** (`results.service.ts:37-40` via
  `GET /api/results/game/:gameId` under `optionalAuth`). PRD 348 put the field there, but the fix
  belongs in the results projection, which is another agent's file. Needs either a `select` on that
  endpoint or `paymentHint` excluded from it.
- Every non-money finding (series authorization, weather/carry-over dedupe, scheduler re-entrancy,
  pair-ranking IDOR, delivery-table pruners) — out of this agent's scope.

---

## Files touched

- `Backend/src/services/transaction.service.ts` — **added** `createGuardedTransfer` (+ its two
  interfaces and `sumTransactionRows`). `createTransaction` and every other existing export are
  byte-for-byte unchanged.
- `Backend/src/services/gameCost/gameCost.service.ts` — claim/release settle, conditional MANUAL
  mark, authorize-before-sync in `requireLedger`, override bound.
- `Backend/src/services/gameCost/costShareReminder.service.ts` — keyset-paged due sweep.
- `Backend/src/services/shop/shopPurchase.service.ts` — conditional wallet debit, per-instance
  refund claim, bounded second refund pass, gift block check, guarded post-commit emits.
- `Backend/src/services/shop/shop.integration.test.ts` — updated + new regressions (below).
- `Backend/src/services/gameCost/gameCostSettle.integration.test.ts` — **new**.

No schema, migration, `package.json` or CI file was edited. No frontend change is needed: no API
shape, status code or error key changed.

---

## Regression tests

### `Backend/src/services/gameCost/gameCostSettle.integration.test.ts` (new)

1. **Double tap pays once** — two simultaneous `markOwnShareAsPaid(…, 'COINS')` on the same share:
   exactly one fulfils, one is refused 400, wallet debited once (1000 → 800), payer credited once,
   **exactly one `TRANSFER` row**, and the share points at that transaction. *Fails on the old code:*
   both requests transferred and the second `update` orphaned the first `Transaction`.
2. **Sequential retry refused**, spends nothing.
3. **Two shares, one wallet (300 coins, two 200-coin shares)** — only one settles, the wallet never
   goes negative, exactly one `TRANSFER`, and the loser's share is left with `confirmedAt: null` and
   `markedPaidAt: null` (the claim was released, not stranded). It then settles normally once funded.
   *Fails on the old code:* `createTransaction` would have taken the wallet to -100.

### `Backend/src/services/shop/shop.integration.test.ts` (extended)

- **Section 9 rewritten** — the old file *asserted the bug* ("this owner was already refunded once
  for this item", `refundedCount: 0`, `skippedCount: 1`). It now asserts the full
  withdraw → re-activate → re-buy → withdraw cycle: `refundedCount: 1`, the second purchase price
  comes back, ownership is 0, and there are **two** `REFUND` rows — one per ownership instance.
- **Section 11 (new, concurrency)** — a 100-coin wallet, two different 100-coin items bought
  simultaneously: exactly one succeeds, the loser is a clean 400, `wallet === 0` (never negative),
  exactly one `UserGoods` row. *Fails on the old code:* both succeeded and the wallet went to -100.
- **Section 12 (new)** — a gift across a `BlockedUser` edge is refused 404 and spends nothing;
  `blockedUser` rows are cleaned up in `finally`.

### Wiring the new test (orchestrator action)

`Backend/src/services/gameCost/gameCostSettle.integration.test.ts` is **not** reachable from any npm
script yet, and I may not edit `package.json`. Please append it to `test:prd-integration`:

```
&& ts-node -r dotenv/config --transpile-only src/services/gameCost/gameCostSettle.integration.test.ts
```

It needs a live `padelpulse_dev` database (it creates its own city/users/games under a run suffix,
sets `COINS_PER_CURRENCY_UNIT` to `100` and restores the previous value in `finally`), and it sets
`E2E_TEST=1` so nothing leaves the process. `npm run test:prd-integration` already runs
`shop.integration.test.ts`, so the shop regressions need no wiring.

---

## Migrations required

**None.** Both blockers and the refund defect were closed with conditional writes over existing
columns:

- the cost-share claim uses the existing `GameCostShare (gameId, userId)` unique row plus its
  `confirmedAt` / `transactionId` columns;
- the shop debit uses `User.wallet`;
- the refund claim uses the existing `UserGoods` row identity.

If a future hardening pass wants a *database-enforced* non-negative balance rather than an
application-enforced one, the migration would be
`ALTER TABLE "padelpulse"."users" ADD CONSTRAINT "users_wallet_non_negative" CHECK ("wallet" >= 0);`
— **not applied here**, because the legacy `createTransaction` path (bets, marketplace, admin grants)
can still produce a negative wallet under concurrency and would start throwing raw constraint errors
instead of `Insufficient funds`. Closing that would mean changing `createTransaction`'s semantics,
which this brief excludes; it is the obvious follow-up once that path is migrated onto
`createGuardedTransfer`.
