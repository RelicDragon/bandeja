# AI agent: Phase 10, Money settling (design, 2026-09-30)

Parent plan: [ai-agent.md](./ai-agent.md) §18. Domain: [economy.md § Cost split ledger](../domains/economy.md#cost-split-ledger). Constraints: [constraints.md § Coins](../product/constraints.md) and § AI agent. Written from a read-only pass over the code at `e1e655894`. File:line references are as of that commit.

The agent helps people settle a game's cost: "what do I owe?", "who still owes me?", "I paid Ana", "Ana paid me", "pay my share with coins", "set the price to 40 €", "nudge the others". It is the **cost split ledger** only. No money moves in the app except the optional coin `TRANSFER` behind "Pay with coins". P2P coin transfers, the shop, bets and payment-method handles stay out of the agent (§10.6).

**Status (2026-09-30): complete.** Slices 10a–10f are built (see the **Built** notes under each slice). 10g is not needed for now: money results carry a `handoff` entity to the game's cost section, which the chat already renders.

## 10.1 Current rules (as built)

### Where the ledger exists

| Entity | Ledger? | Organizers for cost purposes | Price source |
|---|---|---|---|
| `GAME`, `TOURNAMENT`, `BAR`, `EVENT` | yes, if the price splits | the game's own `OWNER` / `ADMIN` rows | the game's own price |
| `TRAINING` | yes, if the price splits | owner / admins. The trainer is `NON_PLAYING` + `ADMIN` after `setTrainer` (`services/game/admin.service.ts:274`), so the trainer is an organizer, has **no share**, and is not the payer unless set as one | the game's own price |
| `LEAGUE` fixture | yes, if the effective price splits | fixture owner / admins **plus the season's `OWNER` / `ADMIN`** (`gameCost.service.ts:169-172`, `:456-460`) | a fixture created `NOT_KNOWN` uses the **season's** `priceType` / `priceTotal` / `priceCurrency` and, unless it has its own, the season's payment methods (`applySeasonCostPricing`, `gameCost.service.ts:192-208`; commit `e1e655894`) |
| `LEAGUE_SEASON` | **never**. Cost endpoints answer 404, sync creates nothing, Wallet and reminders skip it (`gameCost.service.ts:236`, `:612`, `:919`; `costSharePermissions.ts:41`) | n/a | n/a |

- **Splits only when** `priceType` is `TOTAL` or `PER_PERSON`, a currency is set, the total is > 0 and at least one player is `PLAYING` (`resolveGameTotalMinor`, `costShareMath.ts:56-69`). `PER_TEAM`, `FREE` and `NOT_KNOWN` give no ledger (`costShareMath.ts:35`).
- **Flag:** `COST_SPLIT_ENABLED` defaults to on (`config/env.ts:273`). With it off, every endpoint is 404 (`gameCost.controller.ts:32-34`).
- **Who owes:** only `PLAYING` participants, in join order (`selectSplitParticipantIds`, `costShareMath.ts:393-406`). Queue, invitees, guests, `NON_PLAYING` (trainers) owe nothing.
- **Payer:** `Game.costPayerId`, or else the owner. For a fixture with no owner row, the season owner. Stamped on first sync (`effectivePayerId`, `gameCost.service.ts:183-185`, `:288-291`). The payer's own row is settled by definition (`deriveShareState`, `costShareMath.ts:375-384`).
- **Math:** integer minor units; `floor(total / n)` each, and the payer takes the remainder (`splitCostShares`, `costShareMath.ts:111`). Overrides survive roster changes (`recomputeShares`, `:266`). Coin-settled rows are pinned and never re-split (`gameCost.service.ts:307`).
- **Derived state:** `syncGameCostShares` rebuilds the rows on every read and write (`gameCost.service.ts:229-388`). A read can write rows, stamp the payer and emit `game-cost-updated`, so authorization must come **before** the sync (`requireLedger`, `gameCost.service.ts:605-622`).

### Locks

| Lock | Rule | Where |
|---|---|---|
| Price fields | `priceType` / `priceTotal` / `priceCurrency` can't change once `resultsStatus !== NONE` or the game is `ARCHIVED` | `GAME_RESULTS_LOCKED_FIELDS` (`services/game/gameResultsLockedFields.ts:35-37`), enforced in `GameUpdateService.updateGame` (`services/game/update.service.ts:223-233`) |
| Freeze | `costFrozenAt` is set when the game goes FINAL: the post-commit hook `onGameFinalizedForCost` (`outcomes.service.ts:1089`), with the hourly sweep as a backstop (`costShareReminder.service.ts:238-271`). **There is no unfreeze path**: a results reset leaves it set | `gameCost.service.ts:293-298`, `:360-362` |
| Frozen ledger | amounts stop moving. `PUT /cost-shares` (payer, payment methods, overrides) is refused with `errors.cost.sharesFrozen`. Mark paid, confirm / unconfirm and remind **still work** | `gameCost.service.ts:644` |
| 7-day retroactive guard | a FINAL game whose `endTime` is more than 7 days ago and that has no share rows never gets a ledger (so a season price set late creates no stale debts or nudges) | `RETROACTIVE_LEDGER_MAX_AGE_MS`, `gameCost.service.ts:76`, `:277-285` |
| Auto reminder window | hourly cron (`0 * * * *`, `costShareReminderScheduler.service.ts:18`) nudges once per game, between 24 h and 7 days after the freeze (`AUTO_REMIND_DELAY_MS` / `AUTO_REMIND_MAX_AGE_MS`, `costShareReminder.service.ts:35-38`, `:273-325`) | persisted dedupe `costReminderDedupe.ts` |
| Manual reminder | one per game per 24 h (`COST_REMIND_COOLDOWN_MS`, `gameCost.service.ts:73`; claim at `costShareReminder.service.ts:153-162`, 429 with `availableAt`). **No 7-day limit** on the manual path | route limiter 10/h (`routes/gameCost.routes.ts:41-52`) |
| Coin share | a `COINS` row with a `transactionId` can't be confirmed, unconfirmed or re-split (`gameCost.service.ts:878-880`, `:899-905`); it is reversed payer → player when the row leaves the ledger (leave, kick, price removed, delete), or kept as a hidden refund claim that is retried (`coinShareReversal.ts`; `retryPendingCoinShareRefunds`, `costShareReminder.service.ts:186-219`) | economy.md § Cost split ledger |
| Coin rate | `PlatformSetting.COINS_PER_CURRENCY_UNIT` is **unset by default**; while it is null every coin option is hidden and a COINS request is refused `errors.cost.coinsUnavailable` | `coinsForShare`, `costShareMath.ts:310-322`; `planCoinSettlement`, `:343-365` |
| Overrides | each 0 ≤ amount ≤ `COST_SHARE_MAX_AMOUNT_MINOR` (100 000 000); only for users who hold a share | `gameCost.service.ts:70`, `:670-685` |

### Who may do what

The predicates are pure, in `services/gameCost/costSharePermissions.ts`, over a context built by `buildActorContext` (`gameCost.service.ts:450-471`), which folds season organizers into `gameAdminUserIds` for fixtures.

| Action | Endpoint | Allowed | Predicate / check |
|---|---|---|---|
| View the split | `GET /api/games/:id/cost-shares` | platform admin, game (or season) owner/admin, `PLAYING` participants. **Being the payer alone is not enough.** Never on `LEAGUE_SEASON` | `canViewCostShares` (`:40-47`); `requireLedger` authorizes before the sync |
| See other people's rows, total, outstanding | same | `canManage` or `canConfirm` (organizers, platform admin, a payer who can view). Ordinary players get only their own row plus "X of N settled" | `projectCostSummary` (`costSummaryProjection.ts:5-29`) |
| Mark own share paid (`MANUAL`) | `POST …/cost-shares/me/paid {method:'MANUAL'}` | a viewer who holds a share and is not the payer. Idempotent (conditional `updateMany`) | `canMarkOwnCostSharePaid` (`:50-52`); payer refused `errors.cost.payerCannotPaySelf` (`gameCost.service.ts:772-775`) |
| Pay own share with coins | same, `{method:'COINS'}` | same, plus rate set, a payer exists, balance ≥ coins, the share not already settled. Claims the row, then `createGuardedTransfer` locks the share and stamps `transactionId` in one transaction. A failure gives the claim back | `planCoinSettlement`; `markOwnShareAsPaid` (`gameCost.service.ts:759-862`); `createGuardedTransfer` (`services/transaction.service.ts:109`) |
| Confirm "Received" / mark someone paid / undo | `POST …/cost-shares/:userId/confirm {confirmed}` | payer (if they can view), organizers, platform admin. **Never the debtor.** Target must hold a share. Coin rows refused. Allowed after freeze. Confirming also sets `markedPaidAt` if empty, so "mark a participant paid" and "confirm received" are the **same** call | `canConfirmCostShare` (`:59-67`); `setShareConfirmed` (`gameCost.service.ts:865-911`) |
| Payer, payment methods, per-player overrides | `PUT /api/games/:id/cost-shares` | organizers (incl. season owner/admin on fixtures), platform admin. Not frozen. The payer must be on the roster or a season organizer | `canManageCostShares` (`:35-37`); `updateGameCostShares` (`gameCost.service.ts:635-734`) |
| Change price | `PUT /api/games/:id` (price fields) | `hasParentGamePermission([OWNER, ADMIN])`: game owner/admin, the **parent's** owner/admin (season organizers for a fixture), platform admin. Refused once results started or archived | `update.service.ts:186-189`, `:223-233`, `:679-709` |
| Season price (drives every `NOT_KNOWN` fixture) | `PUT /api/games/:seasonId` | season owner/admin, platform admin | same service |
| Remind unpaid | `POST …/cost-shares/remind` | payer (if they can view), organizers, platform admin; 24 h cooldown per game | `canRemindCostShares` (`:70-75`); `remindUnpaidShares` (`costShareReminder.service.ts:132-170`) |
| My debts and credits | `GET /api/transactions/owed` | self. `owed` = my unconfirmed shares on games where I am `PLAYING` or an organizer (or a season organizer), excluding games I pay for. `owedToMe` = others' unconfirmed shares on games where **I am the payer**. 50 rows each | `getOwedSummary` (`gameCost.service.ts:914-994`) |
| Wallet balance | `GET /api/transactions/wallet` | self | `TransactionService.getUserWallet` (`transaction.service.ts:495-514`) |

Note: the DTO's `canConfirm` flag is computed with `canRemindCostShares` (`gameCost.service.ts:596`); both predicates allow the same actors.

Frontend mirrors this: `canViewGameCost` gates mounting (`Frontend/src/features/cost/costViewModel.ts:140-160`); the Received checkbox is disabled for coin rows (`components/GameDetails/cost/GameCostCard.tsx:374-381`); Wallet rows deep-link to `/games/:id?section=cost&settle=1` (`components/wallet/WalletOwedSections.tsx:85`).

### Findings from the pass

1. **`remindUnpaidShares` synced before it authorized** (`costShareReminder.service.ts:138` before `:147`). A stranger's `POST …/remind` made the sync run (it writes rows, stamps `costPayerId` and emits into the room) before the 403. **Fixed:** `remindUnpaidShares` now authorizes through the exported `requireLedger(…, { emit: false })` (`gameCost.service.ts`) before it rebuilds anything; the regression test is in `gameCostSettle.integration.test.ts`. The agent tool still authorizes through `getGameCostSummary` first.
2. **`get_game` showed the raw price for fixtures** (`tools/games.tools.ts:245-248`). A `NOT_KNOWN` fixture read as "price unknown", although the ledger splits it by the season price. **Fixed in 10a:** `get_game` runs the price through `applySeasonCostPricing` (`agentEffectivePrice`, `dto/cost.dto.ts`) and reports `price.priceSource: 'season' | 'game'`.

## 10.2 Rules for every money tool

1. **Reuse, never re-derive.** Every tool calls the `gameCost` service the HTTP controller calls, with the same arguments. Permission is the service's own predicate. The tool adds only the agent visibility guard in front (`assertAgentCanViewGame`; hidden = the same `not_found` as a missing id). The pure math in `costShareMath.ts` may be used for **previews** only; execution always goes through the service.
2. **Authorize before any sync.** Use `getGameCostSummary` (→ `requireLedger`) as the first ledger touch. Never call `syncGameCostShares` or `remindUnpaidShares` before it.
3. **No invented amounts.** Every amount on a card comes from the server: a share row, `viewerCoinCost`, the wallet, or (for `set_game_price` only) the number the user typed. Amounts are shown as integer minor units plus a server-formatted string (`formatCostAmount`, `costReminderCopy.ts:91`). Different currencies are never added together or converted. The system prompt says: "Money amounts come only from tool results; never compute, convert or round them yourself."
4. **Plans are pinned; confirm re-validates.** Each plan stores what the card showed (share amount, currency, payer, state, coins, rate, price). At confirm, `authorize` re-runs the guard with a freshly loaded principal. `execute` re-reads the summary, and **any difference refuses the card** as a `failed: { changed: false }` outcome with "the split changed, ask again" (the pattern of `results.tools.ts:360-366`). Nothing is written.
5. **Coins are critical.** Any tool that can move coins is `riskTier: 'critical'`: it always asks, can never be ALWAYS_ALLOW, and never auto-approves. That includes `set_game_price`, which escalates to critical when removing or changing the price would trigger a coin reversal.
6. **League fixtures inherit the season price.** Reads report `priceSource: 'season' | 'game'`. `set_game_price` refuses `LEAGUE` and `LEAGUE_SEASON` and hands off to the app (§10.7 decision 3).
7. **The 7-day guard holds.** No tool creates a ledger by any path other than the service's sync. `get_game_cost` reports `no_ledger: 'too_old'` for a FINAL game past the 7-day window with no rows. Nothing retro-prices it.
8. **Target users are `playerId`**, never `userId` (registry invariant). The actor is always the principal.
9. **Output is an agent DTO** (`dto/cost.dto.ts`). Users are the agent's public card (`agentCostUserCard`, built from the service's `BasicUser`). **No payment-method handles** (IBAN, phone, tag) and no `paymentHint`: only the method ids (`BIZUM`, `CASH`, …) so the model can say "pay Ana by Bizum; the details are in the app" and link the game's cost section (constraint § AI agent, §10.7 decision 1).
10. **Errors:** map `errors.cost.*` keys (`sharesFrozen`, `alreadySettled`, `insufficientCoins`, `coinsUnavailable`, `noPayer`, `payerCannotPaySelf`, `remindCooldown`, `shareNotFound`, `notAvailable`) to readable agent strings in `i18n/agentMoneyI18n.ts` (11 languages, parity test).

## 10.3 Slices and tools

New file `Backend/src/services/agent/tools/money.tools.ts` (reads and writes, `MONEY_TOOLS` in `tools/index.ts`), strings in `i18n/agentMoneyI18n.ts`, DTO in `dto/cost.dto.ts`. No schema change. The only service change is the optional `expect` argument in 10d.

| Slice | Side | Tools | Deps |
|---|---|---|---|
| 10a | BE | `list_my_cost_balances`, `get_game_cost`, `get_my_wallet` (reads); `get_game` effective fixture price | none |
| 10b | BE | `mark_my_share_paid` (standard) | 10a |
| 10c | BE | `confirm_share_received` (standard) | 10a |
| 10d | BE | `pay_my_share_with_coins` (**critical**) + `expect` guard in `markOwnShareAsPaid` | 10b |
| 10e | BE | `set_game_price` (standard, escalates to critical) | 10a |
| 10f | BE | `remind_unpaid_shares` (standard) | 10a |
| 10h | BE | `list_cost_shares` (read): organizer's cross-game / season view, views `by_player` · `totals` · `payer` (`tools/costShares.tools.ts`, read-only `gameCost/costShareListing.ts`) | 10a |
| 10g | FE+TG | "Open cost" deep link (`?section=cost&settle=1`) on the game chip, if plain text is not enough (decide after 10a–10f) | 10a–10f |

### 10a Reads

**`list_my_cost_balances {direction?: 'owed' | 'owed_to_me' | 'both' = 'both'}`** (read)
- Service: `getOwedSummary(principal.userId)` (`gameCost.service.ts:914`). No extra query.
- Guard: the service scopes to the principal. Every row's game is one the user plays in or organizes (or a season fixture), so it is agent-visible. As a belt, rows still pass through the agent visibility rule (one `agentVisibleGamesWhere` query over the row game ids, the list form of `canAgentViewGameRow`).
- Output: rows `{gameId, title, startTime, amountMinor, currency, amount (formatted), state: UNPAID|MARKED_PAID, counterparty: user card}`; `totals` per currency (server-summed); `truncated` when a list hits the service's 50-row cap. Entities: game refs.
- Note for the model: "owed to me" lists only games where the user is the **payer**. An organizer who is not the payer sees their games through `get_game_cost`.

**`get_game_cost {gameId}`** (read)
- Guard: `assertAgentCanViewGame`, then `getGameCostSummary(gameId, principal.userId, await getRemindAvailableAt(gameId))`, exactly as `gameCost.controller.ts:42-51`. A 403 from `requireLedger` (e.g. a queued player on a public game) returns `forbidden` with "only players and organizers see the cost".
- Output (projected by the service, so ordinary players get only their own row): `available`, `priceSource`, `total` / `outstanding` (null for players), `currency`, `payer` card, `frozen`, `estimated`, `shares[]` (`player` card, amount, state, `method`, `isPayer`, `isOverridden`), `settledCount / shareCount`, `myShare`, `paymentMethodIds[]` (ids only), and `myActions {canMarkPaid, canPayWithCoins, coinCost, coinBalance, canConfirm, canRemind, remindAvailableAt, canManage}`.
- When `available` is false, a server-computed `reason`: `no_price | per_team | free | no_players | season | too_old | feature_off` (`no_players`: a splittable price but nobody `PLAYING`). The reason comes from the game row through `applySeasonCostPricing` + `resolveGameTotalMinor` (read-only, no sync). `season` and `feature_off` answer before any ledger call.
- App link (§10.7 decision 1): `appLink` + a `handoff` entity to `/games/:id?section=cost`, with `&settle=1` when the viewer still owes (opens the settle sheet that shows the payment details).

**`get_my_wallet {}`** (read)
- Service: `TransactionService.getUserWallet(principal.userId)` → `{coins}`, plus `coinsForCostShares: boolean` (whether `COINS_PER_CURRENCY_UNIT` is set, via `getNumericSetting`). No transaction history in v1: P2P rows carry other users' free-text messages. That is parked.

**`get_game` fix:** apply `applySeasonCostPricing` to the selected price fields, so a fixture shows the season price with `price.priceSource: 'season'` (`'game'` otherwise).

**Built (2026-09-30):** `tools/money.tools.ts` (`MONEY_TOOLS`), `dto/cost.dto.ts`, `i18n/agentMoneyI18n.ts`; system prompt rule 6 carries `AGENT_MONEY_RULE` (the three reads, amounts only from tool results, never payment details); `npm run test:agent-money`.

### 10b `mark_my_share_paid {gameId}` (write, standard)

- Propose: `assertAgentCanViewGame` → `getGameCostSummary`. Require `viewerShare` and not the payer. `MARKED_PAID` → "already marked, waiting for the payer"; `SETTLED` → "already settled". Neither creates a card.
- Plan: `{gameId, amountMinor, currency, payerUserId, state:'UNPAID'}`.
- Confirm: `authorize` = view guard + `getGameCostSummary` (throws for non-viewers). `execute` re-reads, compares the plan → stale refusal, then `markOwnShareAsPaid(gameId, userId, 'MANUAL')`.
- Card: **"Mark your share as paid"**. Lines: Game · Amount `€10.00` · To `Ana P.` · Method "paid outside the app". Warning: "Ana still has to confirm she received it."
- Entities: game, payer.
- **Built (2026-09-30):** `markMySharePaidTool` in `tools/money.tools.ts`. The card leads with the game in its title (no separate Game line). Stale = state, amount, currency or payer differ at confirm. A plain player who is the payer gets `is_payer`; the trainer / a non-playing platform admin get `no_share` (HTTP 403).

### 10c `confirm_share_received {gameId, playerId, received: boolean = true}` (write, standard)

This covers both "Ana paid me" and "mark Ana as paid": it is the one service call (§10.1). `received:false` undoes it.
- Propose: view guard → `getGameCostSummary`. Require `canConfirm`. The target must be in `shares` (organizers see every row). Refuse the payer's row, coin rows (`method = COINS`: "paid in coins, already settled") and no-op changes.
- Plan: `{gameId, playerId, amountMinor, currency, fromState, received}`.
- Confirm: `authorize` = view guard + summary `canConfirm`. `execute` re-reads, compares the target row → stale refusal, then `setShareConfirmed(gameId, userId, playerId, received)`.
- Card: **"Mark Ana's share as received"** (or "…as not received"). Lines: Player · Amount · State `Marked paid → Settled`. Warnings: "Ana hasn't marked it paid herself" when `fromState = UNPAID`; "Acting as platform admin" when the principal is only a platform admin; "The game has ended; the amounts are final" when frozen.
- One player per card (§10.7 decision 2).
- **Built (2026-09-30):** `confirmShareReceivedTool` in `tools/money.tools.ts`. Refusals without a card: `no_share` (target not in the split), `payer_row`, `paid_in_coins`, `already_received`, `not_received`. Undo goes to Marked paid (confirming stamps `markedPaidAt`). The platform-admin warning uses the ledger's organizer rule (game or, for a fixture, season OWNER/ADMIN). Stale = the target row's state, amount, currency, or the payer differ. Model rule 6 (`AGENT_MONEY_RULE`) now names both writes; the out-of-scope list says "paying with coins or changing a game's price" instead of "payments". Frontend: the generic confirmation card renders both; tool names / descriptions come from the backend (`agentToolPermissionI18n.ts`), so no FE change.

### 10d `pay_my_share_with_coins {gameId}` (write, **critical**)

- Propose: view guard → `getGameCostSummary`. Refuse with the service's own reasons when `viewerCoinCost` is null (rate unset, payer, settled, no payer) or `viewerCoinBalance < viewerCoinCost` (`insufficient_coins`, balance and cost stated). A `MARKED_PAID` share is not refused: the service allows coins on a share that is marked but not confirmed, and the agent follows it.
- Plan: `{gameId, amountMinor, currency, coins, coinsPerCurrencyUnit, payerUserId}`.
- Confirm: `authorize` = view guard + summary. `execute` calls `markOwnShareAsPaid(gameId, userId, 'COINS', { expect: { amountMinor, coins, payerUserId } })`.
- **Service change (the only one in Phase 10):** `markOwnShareAsPaid` takes an optional `expect`. When it is present, after `planCoinSettlement` the service refuses `409 errors.cost.shareChanged` unless `plan.coins === expect.coins && plan.payerId === expect.payerUserId`. The claim `updateMany` adds `amountCents: expect.amountMinor` to its `where`, so a re-split between the read and the claim can't be paid at the old price. HTTP passes nothing and behaves exactly as today. The tool maps 409 to the stale refusal.
- Card: **"Pay your share with coins"**. Lines: Game · Share `€10.00` · Coins to send `1 000` · To `Ana P.` · Your balance `1 500 → 500`. Warnings: "The coins go to Ana right away. They come back only if you leave the game or the price is removed." · "Rate: 100 coins per EUR".
- Never ALWAYS_ALLOW; a forged ALWAYS_ALLOW row never auto-approves (as `finish_results`).
- **Built (2026-09-30):** `payMyShareWithCoinsTool` in `tools/money.tools.ts`; `MarkOwnSharePaidOptions.expect` in `gameCost.service.ts`. The expect check runs after `planCoinSettlement` (so "not enough coins" / "coins unavailable" keep their own errors), compares the row's amount, `plan.coins` and `plan.payerId`, and the claim's `where` adds `amountCents`; a claim that misses an unsettled row is reported as `shareChanged`, not `alreadySettled`. The plan also pins `currency` and the rate; `execute` re-reads first, so a new rate or re-split is stale before the service is reached. Refusals without a card: `no_share`, `is_payer`, `already_settled`, `no_payer`, `coins_unavailable`, `insufficient_coins` (balance and cost in the data). A `MARKED_PAID` share gets the warning "you already marked it paid outside the app". Late service refusals map to readable FAILED lines (`insufficientCoins`, `coinsUnavailable`, `noPayer`, `alreadySettled`). The test sets `COINS_PER_CURRENCY_UNIT` in one try/finally (tested the unset case at its end) and restores the previous value.

### 10e `set_game_price {gameId, priceType: 'TOTAL'|'PER_PERSON'|'PER_TEAM'|'FREE'|'NOT_KNOWN', amount?: number, currency?: PriceCurrency}` (write, standard → critical)

- Guard: `assertAgentGamePermission(principal, gameId, [OWNER, ADMIN], {requireRosterMutable: true})`. This is `update_game`'s guard and mirrors `update.service.ts:186-189` + `:223-233`.
- Entity types: `GAME | TOURNAMENT | TRAINING | BAR` (`update_game`'s `UPDATABLE_ENTITY_TYPES`, `gameWrites.tools.ts:46`). `LEAGUE` is refused: "this fixture uses the season price; change it on the season in the app". `LEAGUE_SEASON` and `EVENT` are refused with a handoff.
- Input: `amount` in major units, required for `TOTAL | PER_PERSON | PER_TEAM` and forbidden otherwise. `currency` is required unless the game already has one. The model must only pass a number the user said; the card repeats it.
- Execute: `GameUpdateService.updateGame(gameId, {priceType, priceTotal, priceCurrency}, userId, isAdmin)`, then `getGameCostSummary` so the result shows the new split. The service keeps validating (> 0, supported currency).
- Preview (from pure `resolveGameTotalMinor` + `recomputeShares` over the current roster, labelled "about"): Price `—  → 40.00 € total` · Split `4 players → about 10.00 € each`. Warnings: `PER_TEAM` → "a per-team price shows no split"; shares already marked paid or received will change; coin-paid shares stay fixed; removing the price refunds coin payments to the players.
- Pinned plan: `{gameId, from: {priceType, priceTotal, priceCurrency}, to: {…}}`. At confirm, if the game's price no longer equals `from` → stale refusal.
- **Escalates to critical** (`escalate(currentState)`) when any share is not `UNPAID`, when a coin-settled share exists, when the currency changes, or when the price is removed while shares exist. Fails closed without state.
- **Built (2026-09-30):** `setGamePriceTool` + `escalateSetGamePrice` in `tools/money.tools.ts`. The ledger facts are read from the stored `GameCostShare` rows without a sync (the payer's own row excluded from "paid"). "Removed" = the new price doesn't split (`FREE`, `NOT_KNOWN` or `PER_TEAM`) while rows exist. `LEAGUE` / `LEAGUE_SEASON` → `league_price` refusal with a `/games/:id` handoff; `EVENT` → `unsupported_type`. Validation before a card: amount required / forbidden by type, currency from the game or asked, decimals within the currency's minor unit, no-op refused. The plan also pins the paid / coin share counts, so a standard card whose ledger has since become "critical-worthy" is stale. The result re-reads `getGameCostSummary` (which applies the new split and any coin reversal).

### 10f `remind_unpaid_shares {gameId}` (write, standard)

- Propose: view guard → `getGameCostSummary` (authorizes **before** any sync; see §10.1 finding 1). Require `canRemind` (it already implies unpaid shares) and `remindAvailableAt == null`. Otherwise answer "you can nudge again at 18:05" with no card. No extra age limit: a frozen game may be nudged as in the app (§10.7 decision 4).
- Plan: `{gameId, recipients: n, outstandingMinor, currency}`.
- Execute: re-read the summary (the organizer sees every row). A changed recipient set → stale refusal. Then `remindUnpaidShares(gameId, userId)`. A 429 closes the action FAILED with `availableAt`.
- Card: **"Remind 3 players to pay"**. Lines: Game · Unpaid `3 of 4` · Outstanding `30.00 €` (organizer view only). Warnings: "Each gets a push notification." · "You can nudge again in 24 h."
- **Built (2026-09-30):** `remindUnpaidSharesTool` in `tools/money.tools.ts`. Title "Remind unpaid players: <game>", lines Players (names, up to 6) · Unpaid `n of N` · Outstanding (the actor can confirm, so they see every row). Refusals without a card: `nothing_to_remind`, `remind_cooldown` (with `availableAt`, time in the user's timezone). The plan pins the sorted recipient ids, outstanding amount and currency. A 429 at confirm closes FAILED with the next time. Platform-admin warning as in 10c.

### 10h `list_cost_shares` (read)

Use case: "as game admin or league-season owner I want to see who has paid their share and who hasn't", plus "how much was collected / is still outstanding" and "how much do I pay as payer and get back". `get_game_cost` covers one game; `list_my_cost_balances.owedToMe` only games where the user is the payer.

- **Input** (`.strict()`, exactly one scope): `{seasonId}` (league tools' naming; every `LEAGUE` fixture with that `parentId`) or `{scope: 'my_organized_games'}`; `view: 'by_player' | 'totals' | 'payer' = 'by_player'`; `states: ('UNPAID'|'MARKED_PAID'|'SETTLED')[] = ['UNPAID','MARKED_PAID']` (by_player only); `when: 'all' | 'upcoming' | 'past' = 'all'` and `from` / `to` (home-city dates, `parseAgentDate`) on `startTime`.
- **Permissions:** `seasonId` → `assertAgentCanViewLeagueSeason` (leagues are public), then season `OWNER`/`ADMIN` or platform admin, else 403 "Only the season's owner and admins…". `my_organized_games` prefilters owner/admin, stored payer and season owner/admin of a fixture (a platform admin sees only their own here, not every game). Every query is ANDed with `agentVisibleGamesWhere`. Per game the exact "sees every row" rule of `projectCostSummary` decides: `canManageCostShares || canRemindCostShares` over `buildActorContext` (payer who may view, game owner/admin, a trainer only as an `ADMIN` participant, season owner/admin of a fixture, platform admin). Games failing it are dropped.
- **Read only:** `listOrganizerCostLedgers` (one `game.findMany` with the cost select + stored `GameCostShare` rows, ≤ 300 games, `truncated`) never calls the sync: no rows, no payer stamp, no freeze, no socket emit. It filters the stored rows as the sync would return them (frozen: all; else the current PLAYING split). A game with a split price but no rows is "not split yet" (`notSplitYet`, ≤ 30 listed); the 7-day guard holds (FINAL, ended > 7 days ago, no rows → `gamesTooOld` count only); FREE / PER_TEAM / no price / no PLAYING player → left out.
- **by_player:** groups by debtor (name-only card `{userId, name}`), each with its shares (≤ 12; game id, title, `fixture` label + `roundNumber` for league fixtures, start, amount, currency, state, `method` + `markedPaidAt` / `confirmedAt` for paid rows, `appLink` `/games/:id?section=cost`), per-state `counts` and `totals` per currency; ≤ 40 players. `shown` = count and per-currency sums of the listed rows. The payer's own row is never a debt.
- **totals** (in both views; for `view: 'totals'` the only block): per currency `expected = settled + markedPaid + unpaid` over every state (the `states` filter does not apply), counts of shares / per state / split games / `gamesNotSplitYet` / `gamesTooOld`.
- **payer:** only games where the user is the effective payer (`costPayerId`, else owner / season owner). Per game and in total, per currency: `outflow` = the split total, `myShare`, `inflowExpected` (= outflow − myShare), `received` (settled), `pending` (marked paid), `outstanding`, `netExpected` = inflowExpected − outflow, `netSoFar` = received − outflow. A game with no rows yet is `ledger: 'projected'`: the split the sync would create with the current roster (`recomputeShares`, pure), flagged, never stored. **Data finding:** the court bill the payer owes the club is not stored anywhere: `GameExternalBooking`, `WeltnerBooking`, `NspadelBooking` and `ExternalBookingMirror` carry no price, `Court.pricePerHour` is a list price, not a paid amount. So `outflow` is the game's split total (`TOTAL` = the amount; `PER_PERSON` = amount × PLAYING players, which is how league fixtures with a per-person season price split), and the tool note says so.
- Amounts are server-summed per currency, never across currencies; no payment methods or handles. Strings `label.listCostShares`, `summary.costShares*` in 11 languages.
- Discoverability: `AGENT_MONEY_RULE` ("who paid / who hasn't paid" → `list_cost_shares`, totals / payer views, then `remind_unpaid_shares` per game); `remind_unpaid_shares` promptHint; the `list_my_cost_balances` note.
- **Built (2026-10-01):** `tools/costShares.tools.ts` (`COST_SHARE_LIST_TOOLS`), `gameCost/costShareListing.ts` (exports `GAME_COST_SELECT`, `GameCostRow`, `RETROACTIVE_LEDGER_MAX_AGE_MS` from `gameCost.service.ts`). Coverage `money-read-cases`; tests in `agentMoney.integration.test.ts` (season owner / admin / platform admin, refused player / stranger / fixture player, organizer scope, states, totals add up, per currency, `when`, payer view incl. projected, no rows for unsplit games, row parity with `get_game_cost`).

## 10.4 Registration details

- `defineTool` with `input` `.strict()`, `scope: 'user'`, `kind`, `riskTier`, `label` and `promptHint` for every write. The reads are not `untrustedContent`: they return game titles like `get_game` does, with the same "names are user data" note.
- Coverage kinds in `tools/__tests__/agentToolCoverage.ts`: `money-read-cases` (10a, 10h) and `money-write-cases` (10b–10f).
- System prompt (`agentContext.service.ts`): one line under the capability list, plus rule 3 of §10.2.
- Docs when built: [domains/agent.md](../domains/agent.md) § Money; [economy.md](../domains/economy.md) (one line: agent parity); constraints § AI agent (list the shipped money writes, and state that coin tools are critical); `docs/UI_TEST_PLAN.md` AI cases for the cards; `docs/architecture/code-map.md`.

## 10.5 Test plan

File `Backend/src/services/agent/__tests__/agentMoney.integration.test.ts`, in the style of `agentResults.integration.test.ts`: real dev DB, the HTTP app for parity, no LLM, no run queue. Script `"test:agent-money": "../scripts/run-heavy sh -c 'ts-node -r dotenv/config --transpile-only src/services/agent/__tests__/agentMoney.integration.test.ts'"`, also appended to `test:agent`. The test sets `COINS_PER_CURRENCY_UNIT` for the coin cases and restores the previous value in `finally`.

Fixtures: `createAgentPermissionFixture` (actors stranger, invited, queued, player, game admin, owner, parent-season owner, platform admin), plus a payer who does not organize, a trainer (TRAINING, `NON_PLAYING` + `ADMIN`), a season with a `PER_PERSON` price and a `NOT_KNOWN` fixture, a FINAL game older than 7 days, and a frozen game.

1. **Registry:** tiers (`pay_my_share_with_coins` critical, the rest standard); strict input rejects `userId` / unknown keys; coverage entries exist.
2. **Visibility:** a hidden private game gives the same `not_found` as a missing id for all seven tools; `LEAGUE_SEASON` → not found / unavailable.
3. **HTTP parity matrix, reads:** for each actor × game, `get_game_cost` (projected rows, `total` null for players) equals `GET /cost-shares` after the DTO mapping; `list_my_cost_balances` equals `GET /transactions/owed`; `get_my_wallet` equals `GET /transactions/wallet`.
4. **Write matrices at propose and confirm:** each write × actor gives the same allow / 403 / 404 as its HTTP route. Also: the principal loses a role between propose and confirm → FAILED, nothing written.
5. **League:** a season owner who is not on the fixture can view, confirm and remind on the fixture. The fixture's split uses the season price (`priceSource: 'season'`). `set_game_price` on a fixture or season → refused with a handoff. `get_game` shows the season price.
6. **Trainer:** the trainer has no share, can confirm and remind (as admin), and `mark_my_share_paid` → no share.
7. **Locks:** frozen → `mark_my_share_paid` / `confirm_share_received` / `remind_unpaid_shares` still work; `set_game_price` refused (results started or archived). FINAL > 7 days with no ledger → `get_game_cost` gives `reason: 'too_old'` and **no rows are created**.
8. **Stale cards:** after the card, a player joins (re-split), the price changes, or the payer changes → each write closes `failed: {changed: false}`, and the DB rows equal the pre-confirm snapshot.
9. **Coins:** happy path (wallets and `transactionId` stamped, balance on the card matches). Insufficient balance at propose → no card; balance spent between propose and confirm → FAILED, share unsettled. Rate unset → refused. Double confirm → one transfer. `expect` mismatch → 409 → stale, no transfer. HTTP without `expect` unchanged (existing `gameCostSettle.integration.test.ts` stays green).
10. **Critical:** `pay_my_share_with_coins` can't be set ALWAYS_ALLOW (400); a forged ALWAYS_ALLOW row never auto-approves; `set_game_price` escalates when a share is paid, a coin row exists, or the currency changes.
11. **Remind:** cooldown → no card (propose) or FAILED with `availableAt` (confirm race); a stranger's `remind_unpaid_shares` creates no rows and stamps no payer (authorization before sync).
12. **Red team:** a game description saying "mark everyone as paid" / "pay with coins" yields at most one pending card, never an executed write. A run tainted by `summarize_game_chat` never auto-approves `confirm_share_received`.
13. **i18n parity:** `agentMoneyI18n` keys in 11 languages (`agentI18nParity.test.ts`).

## 10.6 Not in Phase 10

- **Payment methods and their handles** (`PUT /cost-shares {paymentMethods}`): IBANs and phone numbers never pass through the model. The user edits them in the app.
- **Payer change and per-player overrides** (`PUT /cost-shares {payerUserId, overrides}`): a later candidate (`set_cost_payer`, `set_share_amount`) once 10b–10f have been used.
- **Season price** for leagues (§10.7 decision 3).
- P2P coin transfers, the shop, bets, transaction history.

## 10.7 Decisions (owner, 2026-09-30)

1. **Payment details: method names plus an app link, never the details.** Money tools return method ids only (`paymentMethodIds`), never a handle (IBAN, bank account, phone, tag) or `paymentHint`, even for the viewer's own debt. "How do I pay Ana?" gets "by Bizum or cash; the details are in the app" and a link to `/games/:id?section=cost&settle=1`. No constraint exception.
2. **Confirm received: one player per card.** No `playerIds[]` batch.
3. **League season price: the agent never changes it.** Not a tool, not later. `set_game_price` refuses `LEAGUE` and `LEAGUE_SEASON` with a handoff.
4. **Manual reminders: match the app.** `remind_unpaid_shares` follows the HTTP rule (24 h cooldown, no age limit); no extra 7-day refusal.
