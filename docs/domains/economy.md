# Economy

Virtual coins on the user wallet. **Coins are never purchasable with real money and must never become so** — no top-up, no IAP, no price in currency anywhere. That is a store-classification constraint, not a preference. Coins enter via admin grant, bet payouts, P2P transfer, or a referral reward; they leave via bets and the cosmetics shop.

Every grant, purchase, gift and refund is atomic with the row it implies and idempotent under retry and concurrent duplicates — see [constraints.md](../product/constraints.md).

## Transactions

`TransactionType`: `NEW_COIN` | `TRANSFER` | `PURCHASE` | `REFUND`. History `GET /transactions`. Admin grant = `NEW_COIN`.

P2P: wallet modal or player card → `SendMoneyToUserModal`. `TRANSFER`, min 1, cannot exceed balance, optional message.

`TransactionRow` may reference `Goods`, and carries the reason in `name` — `Transaction` has no `reason` column. A machine value written there (`'REFERRAL'`) cannot be localized later, so the Wallet maps it back to real copy at render time (`Frontend/src/features/referral/walletReferralRow.ts`). Any new machine reason must be added to that map or users read the constant on screen.

`TransactionService.createTransaction` reads the sender's wallet *outside* its own `$transaction` and then decrements unconditionally, so two concurrent spends can both pass the check. That path is shared with bets, the marketplace and admin grants and is deliberately left as it is; the two paths that must not overdraw have their own narrowly-scoped writers:

- `createGuardedTransfer` (`transaction.service.ts`) — a P2P transfer whose balance check **is** the debit: `UPDATE … WHERE wallet >= total`. The two wallet writes are ordered by user id so two people paying each other at the same instant cannot deadlock. Past the commit nothing may throw: the caller treats a throw as "no money moved".
- `purchaseGoods` — the same conditional decrement inside the purchase transaction (below).

## Bets

Create/accept/update/cancel coin stakes on games. Locked when `resultsStatus` is `IN_PROGRESS` or `FINAL`. Resolve on results. Payout reconcile every 5 min. Socket bet events.

## Game price

Optional on create: `priceType`, `priceCurrency`, `priceTotal`. Display only — not charged in-app. The cost split below turns a `TOTAL` price into a per-player ledger.

## Cost split ledger

A per-game record of **who owes what and who has paid**. It is a ledger, not a payment system: no money moves in the app, there is no payment provider, and there is no card, bank or wallet integration. The only value transfer it can trigger is the existing in-app coin `TRANSFER`, which is optional and off by default. Flag: `COST_SPLIT_ENABLED` / `VITE_COST_SPLIT_ENABLED` — endpoints answer 404 when off.

| Field | Where | Meaning |
|-------|-------|---------|
| `GameCostShare` | one row per payer per game, unique `(gameId, userId)` | `amountCents` (integer minor units), `currency` (ISO, copied from the game), `markedPaidAt`, `confirmedAt`, `method MANUAL\|COINS`, `transactionId` |
| `Game.costPayerId` | game | who fronted the money; materialized to the owner on first sync |
| `Game.paymentMethods` | game, `Json` | up to 3 `{ method, handle }` entries — how to pay the organiser back. `method` is an id from the country-scoped catalogue (`@bandeja/shared/payments`); `handle` is a phone number, tag, IBAN or free text. Never parsed as a bank detail, never sent anywhere but the game's own participants, and never in a guest-readable projection |
| `Game.paymentHint` | game, `VarChar(120)` | **legacy one-line mirror** of `paymentMethods`, written through on every save for app builds shipped before the catalogue. Never the source of truth — read both through `resolvePaymentMethods`. Same entitlement gate |
| `User.payoutMethods` | user, `Json` | the organiser's saved defaults, prefilled onto games they create. Own-profile payload only |
| `Game.costFrozenAt` | game | set the first time the ledger is observed with `resultsStatus = FINAL`; amounts stop moving from then on |
| `PlatformSetting.COINS_PER_CURRENCY_UNIT` | platform | coins per one major unit of a game's currency. **Deliberately unset.** While it is null the coins option is hidden on both the frontend and the backend |

Profile payment defaults use a local draft with **Save** and **Cancel**. Adding a method or typing its handle never writes to the server. Save validates the complete list; failed saves and unrelated profile refreshes preserve the draft.

Load-bearing rules:

1. **Money is integer minor units end to end.** `Game.priceTotal` (a `Float`) is converted exactly once, at the boundary, by `resolveGameTotalMinor`. Everything downstream is integer cents; display is the only place a value becomes a float again (`gameCost/costShareMath.ts`, `Frontend/src/features/cost/costMoney.ts`).
2. **The rounding remainder goes to the payer.** Everyone gets `floor(target / n)` and the payer absorbs the rest, so the rows always sum to the total. With no payer in the split the first participant in join order takes it, so the result is still deterministic (`splitCostShares`).
3. **Shares are derived state.** `syncGameCostShares` rebuilds them from the roster on every read and every write, so no roster mutation path has to remember to call anything. It is idempotent and emits `game-cost-updated` only when something actually changed.
4. **Frozen means frozen.** Once `costFrozenAt` is set, `syncGameCostShares` returns the stored rows untouched and `PUT /cost-shares` is rejected.
5. **A coin-settled share never moves.** Rows with `method = COINS` and a `transactionId` are pinned out of every later re-split: that money has already changed hands.
6. **The payer's own row is settled by definition** and is excluded from "outstanding". It is derived, not stored, so changing the payer is a clean operation.
7. **`City.country` is a display name, and one resolver turns it into a country.** The column stores "Spain", "Bosnia and Herzegovina", "United Kingdom" — never an ISO code. `resolveCountryIso2` (`@bandeja/shared/geo/countryIso2`) is the single map, used by the payment catalogue on both sides and by the currency guess (`Backend/src/utils/currencyFromCountry.ts`). A second map, or a length check that assumes ISO-2, silently answers "unknown country" for every city in the database and reduces the picker to its three universal methods everywhere. `shared/geo/countryIso2.test.ts` pins every value the database actually holds.
8. **The payment-method catalogue is scoped by country, and only offers.** `paymentMethodsForCountry(iso2)` is what the picker shows: `CUSTOM` first everywhere, then the rails that actually exist there (Bizum in Spain, IPS Prenesi in Serbia, Pix in Brazil, PromptPay in Thailand), then `BANK_TRANSFER` and `CASH`, which are universal. IBAN and Revolut are deliberately absent in the western Balkans, across Asia and across Latin America — nobody splits a court that way there. The API does **not** enforce the country list: a visiting organiser may legitimately want their own country's rail, so country is a relevance filter, never a permission.
9. **The share row is claimed before any coin moves.** `POST …/me/paid` with `method: 'COINS'` runs the guards (rate set, payer exists, balance sufficient), then claims the row with a conditional `updateMany` that only matches while it is still unsettled, and only then calls `createGuardedTransfer`. A failure hands the claim back scoped to that exact claim, so it can never clear somebody else's settlement; an insufficient balance surfaces as a clean error and can never leave a share half-settled or double-charged.

**Who is in the split:** only `PLAYING` participants. Paying the club does not create an extra share: four players means four shares and “X of 4 settled,” even when a non-playing organizer fronted the money. A playing payer keeps their ordinary player share, settled by definition. A player who leaves stops being `PLAYING` and drops out on the next sync. A substitution moves the row, including its paid state, to the substitute (`transferCostShareOnSubstitution`). Existing frozen ledgers keep their stored amounts, but any legacy non-playing payer row is excluded from the tracker and its settlement counts. Games priced `PER_TEAM` have **no** cost card: a team price yields a game total only when the team count is known, and nothing on `Game` states it.

**Visibility:** only current `PLAYING` participants, the game's own `OWNER`/`ADMIN`, and platform `isAdmin` users may view the tracker. Queue members, invitees, chat guests, ordinary non-playing participants and former participants are excluded, even if a share remains. The frontend checks before mounting/fetching; the backend enforces the same access rule, including Wallet cost entries. Being the payer alone does not grant access.

**What viewers see:** ordinary players receive only their own share (amount, status and **I paid** action) plus the game-wide settlement count, e.g. “2 of 4 settled.” They see neither other players' rows nor the total price or outstanding money. The cost API applies the same projection to reads and mutation responses: `shares` contains only the viewer's row, `totalMinor` and `outstandingMinor` are null, and `shareCount` / `settledCount` remain full player counts. An eligible player without a share sees only the counts. Owners, game admins, platform admins and payers with tracker access retain all player rows and collection totals/controls. No view shows the payer avatar in the header or a “paid the club” label; payment instructions still identify the recipient in the settlement sheet.

`LEAGUE_SEASON` never has a tracker, including for owners and platform admins. Its individual `LEAGUE` games remain eligible under the same viewer and price rules. Season cost endpoints return 404; sync creates no season shares, and season records are excluded from Wallet cost entries and reminders.

The tracker starts expanded. Its full-width bottom chevron uses the same height/fade animation and rotating arrow as GameInfo; reduced-motion preferences make the transition instant. Collapsing keeps the title, permitted total or settlement count, and frozen badge visible while hiding share rows and actions. Cost/settlement deep links expand the card.

**Permissions** live in `gameCost/costSharePermissions.ts`; actions require tracker access first.

| Actor | View | Configure payer / payment methods / overrides | Mark own paid | Confirm "Received" | Remind |
|-------|------|------------------------------------|---------------|--------------------|--------|
| Game owner / admin | yes | yes | own row only | yes | yes |
| Playing payer (not an organizer) | yes | no | own row only | yes | yes |
| Playing participant with a share | yes | no | own row only | no | no |
| Playing participant, no share | yes | no | no | no | no |
| Everyone else | no | no | no | no | no |
| Platform admin | yes | yes | no share of their own | yes | yes |

Endpoints (all authenticated and rate-limited): `GET`/`PUT /api/games/:id/cost-shares`, `POST …/cost-shares/me/paid` `{ method }`, `POST …/cost-shares/:userId/confirm` `{ confirmed }`, `POST …/cost-shares/remind`, and `GET /api/transactions/owed` for the Wallet's outstanding rows in both directions.

**Reminders.** `GAME_COST_REMINDER` → `sendWalletNotifications`. `CostShareReminderScheduler` runs hourly: it first freezes the ledger of games that have gone FINAL since the last pass (that is what sets `costFrozenAt`), then nudges every game frozen between 24 h and 7 days ago that still has an unconfirmed share. An organizer or a payer with tracker access may also nudge by hand, once per 24 h per game. Dedupe is persisted, never an in-memory `Set` — [notifications.md](./notifications.md).

Card price row (`perHeadPrice`): [home-and-find.md](./home-and-find.md). While shares are still estimated it divides by the **seat count**, so a card answers "what will this cost me if I join?" before anybody has joined; once `costFrozenAt` is set it divides by the real share count and `estimated` flips to `false`.

## Cosmetics shop

Coins finally have a sink. The shop sells **cosmetic items only, for coins only**. Flag: `SHOP_ENABLED` (backend, `requireShopEnabled` → 404) / `VITE_SHOP_ENABLED` (frontend, `isShopEnabled()`); with the flag off the shop renders nothing and issues no request.

| Concept | Where it lives |
|---------|----------------|
| A catalogue item | `Goods` — `kind GoodsKind`, `assetKey`, `previewUrl?`, `description?`, `price`, `isActive`, `isFeatured`, `premiumOnly`, `sortOrder`, `stickerPackId?`; `@@unique([kind, assetKey])` |
| Ownership | `UserGoods(userId, goodsId, purchasedAt, giftedByUserId?, equipped)`, `@@unique([userId, goodsId])` |
| Purchase history | the existing `Transaction` / `TransactionRow.goodsId` pair |
| What a cosmetic *looks* like | a CSS class keyed by `assetKey` in `Frontend/src/styles/collection.css` |

`GoodsKind` is `PROFILE_FRAME | CHAT_ACCENT | STICKER_PACK | NAME_COLOR`. Legacy `Goods` rows that predate the shop were backfilled as inactive `PROFILE_FRAME`s with a synthetic asset key; they are not catalogue items and never appear in the shop.

**The catalogue has to be seeded, or the shop ships dark.** `/shop` renders "The
shop opens soon" until an active `Goods` row exists, and every `assetKey` has to
match a class in `Frontend/src/styles/collection.css` — an unknown key renders a
plain avatar, which reads as a bug rather than a cosmetic. `npm run seed:shop-goods`
(`Backend/scripts/seed-shop-goods.ts`) writes the opening fifteen items, upserting
on `(kind, assetKey)`, so it is safe to re-run and never touches who owns what.
`-- --dry-run` prints the plan. The keys it uses are exactly the ones
`Frontend/src/features/collection/collectionAssets.ts` paints.

**Purchase is one transaction.** `purchaseGoods` (`services/shop/shopPurchase.service.ts`) does all of this inside a single `prisma.$transaction`: re-read the `Goods` row (price and flags are read *inside* the transaction, never before it) → run `rejectPurchase` from `shopRules.ts`, the only place the gate lives → `create` the `UserGoods` row (**not** `upsert`: the unique index must be the thing that rejects a double tap, so a lost race surfaces as `P2002` → HTTP 409) → write the `PURCHASE` `Transaction` with a negated total and a row carrying `goodsId` and the item name → debit the buyer with `updateMany({ where: { wallet: { gte: price } } })` and credit the bank. **That conditional predicate, not the `rejectPurchase` read, is what authorises the spend**: a plain read-then-decrement let N concurrent buys of N *different* items each pass their own balance check and overdraw the wallet. `TransactionService.createTransaction` is deliberately not reused — it opens its own transaction, which would put the coin movement and the ownership row in two different atomic units.

**Gift.** A gift is a purchase with a recipient: the `UserGoods` row belongs to the **recipient** (`giftedByUserId` = the payer), the wallet debit belongs to the **buyer**, and a premium-only item follows the **recipient's** membership, because the recipient is the one who ends up wearing it. `GOODS_GIFT_RECEIVED` → `sendWalletNotifications`.

**Withdrawal and refunds.** An item is never deleted — `TransactionRow.goodsId` points at it, and deleting would null out the item name in wallet history. `ShopAdminService.withdraw` deactivates the row and `refundGoodsOwners` pays every owner exactly once. **Idempotency is per ownership instance, not per `(user, goods)` lifetime**: the claim is the `deleteMany` on the `UserGoods` row itself, in the same transaction as the payout, so ownership is only ever destroyed when the matching refund lands and a failed payout restores it. The older "has this user ever held a REFUND row for this goods id" rule lost the money on a withdraw → reactivate → re-buy → withdraw cycle. Each owner settles in its own transaction, the owner list is re-read once (`REFUND_PASSES = 2`) to catch a purchase that committed mid-sweep, and re-running a withdrawal pays nobody twice.

**Equipping.** At most **one item per kind** may be equipped; `ShopService.equip` unequips the previous item of that kind and equips the new one in one transaction, so no viewer can ever observe two frames. `GET /shop/equipped?userIds=` is the public projection — `{ frame, nameColor }` per user — and deliberately omits `CHAT_ACCENT`, because an accent only ever paints its owner's own outgoing bubbles and never leaves the owner's session ([chat.md](./chat.md)).

**Premium precedence.** An equipped `NAME_COLOR` paints a player's name everywhere *except* when `showsPremiumStatus(user)` is true: gold is what membership signals and a bought colour must not imitate it. One function, `resolveNameClass` (`Frontend/src/features/collection/collectionAssets.ts`), used by `PremiumName`.

Player-facing reads live on `/api/shop`; `/api/goods` is admin-only ([admin.md](./admin.md)).

## Referral payouts

The referral payout is the only automatic coin grant triggered by gameplay, so it is also the one with a hard idempotency contract. How a referrer is attached in the first place is attribution, not economy — [ads-and-attribution.md](./ads-and-attribution.md).

**When.** On the referred user's first finished game: post-commit in `recalculateGameOutcomes`, for a `Game` with `resultsStatus === 'FINAL'` whose `entityType` is `GAME`, `TOURNAMENT` or `LEAGUE`. Rated or not — a friendly still counts.

**How much.** `PlatformSetting.REFERRAL_REWARD_REFERRER` (default 50) and `REFERRAL_REWARD_REFERRED` (default 25), read through `getNumericSetting` with those defaults as fallbacks. Both floored to a non-negative integer; a zero amount skips that side's grant.

**How it cannot pay twice.** `ReferralReward.referredUserId` is `@unique` and `grantReferralReward` inserts that row **before any coin moves**. A retry, a concurrent finalization of two games, or an admin re-running `recalculateGameOutcomes` loses the insert with `P2002` and returns immediately. If *both* grants then fail the claim is deleted so a later game can retry; a partial success keeps the row, because retrying would double-pay the side that already got its coins.

**Why post-commit.** The grant writes wallet rows for people who are not in the game. Inside the outcomes transaction that would widen its lock footprint to unrelated users, and a referral failure would be able to roll back a finalized result. `onGameFinalizedForReferral` therefore sits next to the other post-commit hooks ([results.md](./results.md)) and never throws.

**Abuse rules** (`referralAbuse.ts`, pure and unit-tested) are evaluated **twice** — once when the referrer is attached and again immediately before the coins move, because a second account can acquire a shared phone, push token or device between those two moments: `SELF` (same user id), `SHARED_TELEGRAM`, `SHARED_PHONE`, `SHARED_PUSH_TOKEN`, `SHARED_DEVICE` (a device id on both accounts, from `PushToken.deviceId` or `UserRefreshSession.deviceId`) and `CAP_REACHED` (50 non-revoked rewards for this referrer). All the identity overlaps collapse to **one** user-facing message: naming the matched signal would confirm the existence of a second account to whoever is probing.

A capped referrer is still **attached** — only the payout is capped, and the invite card says so while keeping the share button. **Revoke** (`ReferralReward.revokedAt`) removes the row from the cap count and the "rewarded" figures but does **not** claw coins back; reversing a spent balance is a separate decision.

## FX

`CurrencyScheduler` every 2 hours (Frankfurter). `GET /currency`.
